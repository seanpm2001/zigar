#include "addon.h"

static Result ReadSlot(Host* call, 
                       uint32_t slot_id, 
                       Local<Value> *dest) {
  Local<Value> value;
  if (call->slots->Get(call->context, slot_id).ToLocal(&value)) {
    if (!value->IsNullOrUndefined()) {
      *dest = value;
      return Result::OK;
    }
  }  
  return Result::Failure;
}

static Result WriteSlot(Host* call, 
                        uint32_t slot_id, 
                        Local<Value> object) {
  call->slots->Set(call->context, slot_id, object).Check();
  return Result::OK;  
}

static Result AllocateMemory(Host* call, 
                             size_t size, 
                             Memory* dest) {
  if (call->mem_pool.IsEmpty()) {
    call->mem_pool = Array::New(call->isolate);
  }
  auto buffer = ArrayBuffer::New(call->isolate, size);
  uint32_t index = call->mem_pool->Length();
  call->mem_pool->Set(call->context, index, buffer).Check();
  std::shared_ptr<BackingStore> store = buffer->GetBackingStore();
  dest->bytes = reinterpret_cast<uint8_t *>(store->Data());
  dest->len = store->ByteLength();
  return Result::OK;
}

static Result GetMemory(Host* call,
                        Local<Object> object,
                        Memory* dest) {
  Local<Value> value;  
  if (!object->Get(call->context, call->data_symbol).ToLocal(&value) || !value->IsDataView()) {
    return Result::Failure;
  }
  auto buffer = value.As<DataView>()->Buffer();
  auto content = buffer->GetBackingStore();
  dest->bytes = reinterpret_cast<uint8_t*>(content->Data());
  dest->len = content->ByteLength();
  return Result::OK;
}

static Result GetRelocatable(Host* call,
                             Local<Object> object,
                             uint32_t slot,
                             Local<Object>* dest) {
  Local<Value> value;  
  if (!object->Get(call->context, call->relocatable_symbol).ToLocal(&value) || !value->IsObject()) {
    return Result::Failure;
  }
  auto relocs = value.As<Object>();
  if (!relocs->Get(call->context, slot).ToLocal(&value) || !value->IsObject()) {
    return Result::Failure;
  }
  *dest = value.As<Object>();
  return Result::OK;
}

static Result SetRelocatable(Host* call,
                             Local<Object> object,
                             uint32_t slot,
                             Local<Object> child) {
  Local<Value> value;  
  if (!object->Get(call->context, call->relocatable_symbol).ToLocal(&value) || !value->IsObject()) {
    return Result::Failure;
  }
  auto relocs = value.As<Object>();
  relocs->Set(call->context, slot, child).Check();
  return Result::OK;
}

static Result CreateSharedBuffer(Host* call,
                                 const Memory& memory,
                                 Local<SharedArrayBuffer>* dest) {
  // create a reference to the module so that the shared library doesn't get unloaded
  // while the shared buffer is still around pointing to it
  auto mde = Local<External>::New(call->isolate, call->function_data->module_data);
  auto emd = new ExternalMemoryData(call->isolate, mde);
  std::shared_ptr<BackingStore> store = SharedArrayBuffer::NewBackingStore(memory.bytes, memory.len, 
    [](void*, size_t, void* deleter_data) {
      // get rid of the reference
      auto emd = reinterpret_cast<ExternalMemoryData*>(deleter_data);
      delete emd;
    }, emd); 
  *dest = SharedArrayBuffer::New(call->isolate, store);
  return Result::OK;
}

static Local<Object> NewStructure(Host* call, 
                                  const Structure& s) {
  auto isolate = call->isolate;
  auto context = call->context;
  auto def = Object::New(isolate);
  auto type = Int32::New(isolate, static_cast<int32_t>(s.type));
  auto size = Uint32::NewFromUnsigned(isolate, s.total_size);
  def->Set(context, String::NewFromUtf8Literal(isolate, "type"), type).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "size"), size).Check();
  if (s.name) {
    auto name = String::NewFromUtf8(isolate, s.name).ToLocalChecked();
    def->Set(context, String::NewFromUtf8Literal(isolate, "name"), name).Check();
  }
  return def;
}

static Local<Object> NewMember(Host* call,
                               const Member& m) {
  auto isolate = call->isolate;
  auto context = call->context;
  auto def = Object::New(isolate);
  auto type = Int32::New(isolate, static_cast<int32_t>(m.type));
  auto is_static = Boolean::New(isolate, m.is_static);
  auto is_required = Boolean::New(isolate, m.is_required);
  auto bit_size = Uint32::NewFromUnsigned(isolate, m.bit_size);
  auto bit_offset = Uint32::NewFromUnsigned(isolate, m.bit_offset);
  auto byte_size = Uint32::NewFromUnsigned(isolate, m.byte_size);
  def->Set(context, String::NewFromUtf8Literal(isolate, "type"), type).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "isStatic"), is_static).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "isRequired"), is_required).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "bitSize"), bit_size).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "bitOffset"), bit_offset).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "byteSize"), byte_size).Check();
  if (m.type == MemberType::Int) { 
    auto is_signed = Boolean::New(isolate, m.is_signed);     
    def->Set(context, String::NewFromUtf8Literal(isolate, "isSigned"), is_signed).Check();
  } else if (m.type == MemberType::Pointer) {
    auto is_const = Boolean::New(isolate, m.is_const);
    def->Set(context, String::NewFromUtf8Literal(isolate, "isConst"), is_const).Check();
  }
  if (!m.structure.IsEmpty()) {
    auto slot = Uint32::NewFromUnsigned(isolate, m.slot);
    def->Set(context, String::NewFromUtf8Literal(isolate, "structure"), m.structure).Check();
    def->Set(context, String::NewFromUtf8Literal(isolate, "slot"), slot).Check();
  }
  if (m.name) {
    auto name = String::NewFromUtf8(isolate, m.name).ToLocalChecked();
    def->Set(context, String::NewFromUtf8Literal(isolate, "name"), name).Check();
  }
  return def;
}

static Local<Function> NewThunk(Host* call, 
                                Thunk thunk) {
  auto isolate = call->isolate;
  auto context = call->context;
  auto module_data = Local<External>::New(isolate, call->function_data->module_data);
  auto fd = new FunctionData(isolate, thunk, module_data);
  auto fde = Local<External>::New(isolate, fd->external);
  return Function::New(context, [](const FunctionCallbackInfo<Value>& info) {
    // Host will extract the FunctionData object created above from the External object
    // which we get from FunctionCallbackInfo::Data()      
    Host ctx(info);
    ctx.function_data->thunk(&ctx, ctx.argument);
  }, fde, 3).ToLocalChecked();
}

static Local<Object> NewMethod(Host* call,
                               const Method &m) {
  auto isolate = call->isolate;
  auto context = call->context;
  auto thunk = NewThunk(call, m.thunk);
  auto is_static_only = Boolean::New(isolate, m.is_static_only);
  auto def = Object::New(isolate);
  def->Set(context, String::NewFromUtf8Literal(isolate, "argStruct"), m.structure).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "thunk"), thunk).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "isStaticOnly"), is_static_only).Check();
  if (m.name) {
    auto name = String::NewFromUtf8(isolate, m.name).ToLocalChecked();
    def->Set(context, String::NewFromUtf8Literal(isolate, "name"), name).Check();
  }
  return def;   
}

static Local<Object> NewDefaultValues(Host* call,
                                      const DefaultValues& values) {
  auto isolate = call->isolate;
  auto context = call->context;
  auto def = Object::New(isolate);
  auto is_static = Boolean::New(isolate, values.is_static);
  def->Set(context, String::NewFromUtf8Literal(isolate, "isStatic"), is_static).Check();
  if (values.default_data.len > 0) {
    Local<SharedArrayBuffer> buffer;
    CreateSharedBuffer(call, values.default_data, &buffer);
    auto data = DataView::New(buffer, 0, buffer->ByteLength());
    def->Set(context, String::NewFromUtf8Literal(isolate, "data"), data).Check();
  }
  if (values.default_pointer_count > 0) {
    auto pointers = Object::New(isolate);
    for (size_t i = 0; i < values.default_pointer_count; i++) {
      if (values.default_pointers[i].len > 0) {
        Local<SharedArrayBuffer> buffer;
        CreateSharedBuffer(call, values.default_pointers[i], &buffer);
        auto data = DataView::New(buffer, 0, buffer->ByteLength());
        pointers->Set(context, i, data).Check();
      }
    }
    def->Set(context, String::NewFromUtf8Literal(isolate, "pointers"), pointers).Check();
  }
  return def;
}

static Result GetJavaScript(Host* call,
                            Local<Object> *dest) {
  if (call->js_module.IsEmpty()) {
    auto isolate = call->isolate;
    auto context = call->context;
    auto mde = Local<External>::New(isolate, call->function_data->module_data);
    auto md = reinterpret_cast<ModuleData*>(mde->Value());
    if (md->js_module.IsEmpty()) {
      auto ade = Local<External>::New(isolate, md->addon_data);
      auto ad = reinterpret_cast<AddonData*>(ade->Value());
      Local<Script> script;
      if (ad->js_script.IsEmpty()) {
        // compile the code
        auto source = String::NewFromUtf8Literal(isolate, 
          #include "addon.js.txt"
        );
        if (!Script::Compile(context, source).ToLocal(&script)) {
          return Result::Failure;
        }
        // save the script but allow it to be gc'ed
        ad->script_count++;
        ad->js_script.Reset(isolate, script);
        ad->js_script.template SetWeak<AddonData>(ad, 
          [](const v8::WeakCallbackInfo<AddonData>& data) {
            auto ad = data.GetParameter();
            ad->js_script.Reset();
            ad->script_count--;
          }, WeakCallbackType::kParameter);
      } else {
        script = Local<Script>::New(isolate, ad->js_script);
      }
      Local<Value> result;
      if (!script->Run(context).ToLocal(&result) || !result->IsObject()) {
        return Result::Failure;
      }
      call->js_module = result.As<Object>();
      // save the module but allow it to be gc'ed
      md->js_module.Reset(isolate, call->js_module);
      md->js_module.template SetWeak<ModuleData>(md, 
        [](const v8::WeakCallbackInfo<ModuleData>& data) {
          auto md = data.GetParameter();
          md->js_module.Reset();
        }, WeakCallbackType::kParameter);
    } else {
      call->js_module = Local<Object>::New(isolate, md->js_module);
    }
  }
  *dest = call->js_module;
  return Result::OK;
}

static Result CallFunction(Host* call,
                           Local<String> name,
                           int argc,
                           Local<Value>* argv,
                           Local<Value>* dest = nullptr) {
  auto isolate = call->isolate;                            
  auto context = call->context;
  Local<Object> module;
  if (GetJavaScript(call, &module) != Result::OK) {
    return Result::Failure;
  }
  Local<Value> value;
  if (!module->Get(context, name).ToLocal<Value>(&value) || !value->IsFunction()) {
    return Result::Failure;
  }
  auto f = value.As<Function>();
  if (!f->Call(context, Null(isolate), argc, argv).ToLocal<Value>(&value)) {
    return Result::Failure;
  }
  if (dest) {
    *dest = value;
  }
  return Result::OK;
}  

static Result BeginStructure(Host* call,
                             const Structure& structure,
                             Local<Object>* dest) {
  auto isolate = call->isolate;
  auto name = String::NewFromUtf8Literal(isolate, "beginStructure");
  auto mde = Local<External>::New(isolate, call->function_data->module_data);
  auto md = reinterpret_cast<ModuleData*>(mde->Value());
  auto options = Local<Object>::New(isolate, md->js_options);
  auto def = NewStructure(call, structure);
  Local<Value> args[2] = { def, options };
  Local<Value> result;
  if (CallFunction(call, name, 2, args, &result) != Result::OK || !result->IsObject()) {
    return Result::Failure;
  }
  *dest = result.As<Object>();
  return Result::OK;
}

static Result AttachMember(Host* call,
                           Local<Object> structure,
                           const Member& member) {
  auto isolate = call->isolate;
  auto name = String::NewFromUtf8Literal(isolate, "attachMember");
  auto def = NewMember(call, member);
  Local<Value> args[2] = { structure, def };
  return CallFunction(call, name, 2, args);
}

static Result AttachMethod(Host* call,
                           Local<Object> structure,
                           const Method& method) {
  auto isolate = call->isolate;
  auto name = String::NewFromUtf8Literal(isolate, "attachMethod");
  auto def = NewMethod(call, method);
  Local<Value> args[2] = { structure, def };
  return CallFunction(call, name, 2, args);
}

static Result AttachDefaultValues(Host* call,
                                  Local<Object> structure,
                                  const DefaultValues& values) {
  auto isolate = call->isolate;
  auto name = String::NewFromUtf8Literal(isolate, "attachDefaultValues");
  auto def = NewDefaultValues(call, values);
  Local<Value> args[2] = { structure, def };
  return CallFunction(call, name, 2, args);
}

static Result FinalizeStructure(Host* call,
                                Local<Object> structure) {
  auto isolate = call->isolate;
  auto name = String::NewFromUtf8Literal(isolate, "finalizeStructure");
  Local<Value> args[] = { structure };
  return CallFunction(call, name, 1, args);
}

static void Load(const FunctionCallbackInfo<Value>& info) {
  auto isolate = info.GetIsolate();
  auto context = isolate->GetCurrentContext();
  auto Throw = [&](const char *message) {
    Local<String> string;
    if (String::NewFromUtf8(isolate, message).ToLocal<String>(&string)) {
      Local<Value> error = Exception::Error(string);
      isolate->ThrowException(error);
    }
  };

  // check arguments
  if (info.Length() < 1 || !info[0]->IsString()) {
    Throw("Invalid arguments");
    return;
  }

  // load the shared library
	String::Utf8Value path(isolate, info[0]);
  void* handle = dlopen(*path, RTLD_LAZY);
  if (!handle) {
    Throw("Unable to load shared library");
    return;
  }

  // find the zig module
  void* symbol = dlsym(handle, "zig_module");
  if (!symbol) {
    Throw("Unable to find the symbol \"zig_module\"");
    return;
  }

  // attach callbacks to module
  auto module = reinterpret_cast<::Module*>(symbol);
  auto callbacks = module->callbacks;
  callbacks->allocate_memory = AllocateMemory;
  callbacks->get_memory = GetMemory;
  callbacks->get_relocatable = GetRelocatable;
  callbacks->set_relocatable = SetRelocatable;
  callbacks->read_slot = ReadSlot;
  callbacks->write_slot = WriteSlot;
  callbacks->begin_structure = BeginStructure;
  callbacks->attach_member = AttachMember;
  callbacks->attach_method = AttachMethod;
  callbacks->attach_default_values = AttachDefaultValues;
  callbacks->finalize_structure = FinalizeStructure;

  // save handle to external object, along with options and AddonData
  auto options = Object::New(isolate);
  auto little_endian = Boolean::New(isolate, module->flags.little_endian);
  auto runtime_safety = Boolean::New(isolate, module->flags.runtime_safety);
  options->Set(context, String::NewFromUtf8Literal(isolate, "littleEndian"), little_endian).Check();
  options->Set(context, String::NewFromUtf8Literal(isolate, "realTimeSafety"), runtime_safety).Check();
  auto md = new ModuleData(isolate, handle, options, info.Data().As<External>());

  // invoke the factory thunk through JavaScript, which will give us the 
  // needed symbols and slots 
  Host ctx(isolate, Local<External>::New(isolate, md->external));
  Local<Function> factory = NewThunk(&ctx, module->factory);
  Local<String> name = String::NewFromUtf8Literal(isolate, "invokeFactory");
  Local<Value> args[1] = { factory };
  Local<Value> result;
  if (CallFunction(&ctx, name, 1, args, &result) != Result::OK || !result->IsObject()) {
    Throw("Unable to import zig module");
  }
  info.GetReturnValue().Set(result);
}

static void GetGCStatistics(const FunctionCallbackInfo<Value>& info) {
  auto isolate = info.GetIsolate();
  auto context = isolate->GetCurrentContext();
  auto stats = Object::New(isolate);
  auto set = [&](Local<String> name, int count) {    
    stats->Set(context, name, Int32::NewFromUnsigned(isolate, count)).Check();
  };
  set(String::NewFromUtf8Literal(isolate, "scripts"), AddonData::script_count);
  set(String::NewFromUtf8Literal(isolate, "modules"), ModuleData::count);
  set(String::NewFromUtf8Literal(isolate, "functions"), FunctionData::count);
  set(String::NewFromUtf8Literal(isolate, "buffers"), ExternalMemoryData::count);
  info.GetReturnValue().Set(stats);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  auto isolate = context->GetIsolate();
  auto ad = new AddonData(isolate);
  auto add = [&](Local<String> name, void (*f)(const FunctionCallbackInfo<Value>& info), int length) {    
    auto data = Local<External>::New(isolate, ad->external);
    auto tmpl = FunctionTemplate::New(isolate, f, data, Local<Signature>(), length);
    auto function = tmpl->GetFunction(isolate->GetCurrentContext()).ToLocalChecked();
    exports->Set(context, name, function).Check();
  };
  add(String::NewFromUtf8Literal(isolate, "load"), Load, 1);
  add(String::NewFromUtf8Literal(isolate, "getGCStatistics"), GetGCStatistics, 0);
} 

int AddonData::script_count = 0;
int ModuleData::count = 0;
int FunctionData::count = 0;
int ExternalMemoryData::count = 0;
