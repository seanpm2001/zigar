#include "addon.h"

static Local<Function> CreateThunk(Isolate* isolate,
                                   FunctionData* fd) {
  auto context = isolate->GetCurrentContext();
  auto fde = Local<External>::New(isolate, fd->external);
  return Function::New(context, [](const FunctionCallbackInfo<Value>& info) {
    Call ctx(info.GetIsolate(), info.This(), info.Data().As<External>());
    void *arg_ptr = nullptr;
    if (info[0]->IsDataView()) {
      auto dv = info[0].As<DataView>();
      if (dv->ByteLength() > 0) {
        auto store = dv->Buffer()->GetBackingStore();
        auto bytes = reinterpret_cast<uint8_t*>(store->Data()) + dv->ByteOffset();
        arg_ptr = bytes;
      }
    }
    auto result = ctx.function_data->thunk(&ctx, arg_ptr);
    if (!result.IsEmpty()) {
      info.GetReturnValue().Set(result);
    }
  }, fde, 3).ToLocalChecked();
}

static Result CallFunction(Call* call,
                           Local<String> name,
                           int argc,
                           Local<Value>* argv,
                           Local<Value>* dest = nullptr) {
  auto context = call->context;
  Local<Value> value;
  if (!call->env->Get(context, name).ToLocal<Value>(&value) || !value->IsFunction()) {
    return Result::Failure;
  }
  auto f = value.As<Function>();
  if (!f->Call(context, call->env, argc, argv).ToLocal<Value>(&value)) {
    return Result::Failure;
  }
  if (dest) {
    *dest = value;
  }
  return Result::OK;
}

static Result AllocateRelocatableMemory(Call* call,
                                        size_t len,
                                        uint16_t align,
                                        Memory* dest) {
  auto isolate = call->isolate;
  auto fname = String::NewFromUtf8Literal(isolate, "allocateRelocatableMemory");
  Local<Value> args[] = {
    Number::New(isolate, len),
    Uint32::NewFromUnsigned(isolate, align)
  };
  Local<Value> result;
  if (CallFunction(call, fname, 2, args, &result) != Result::OK || !result->IsDataView()) {
    return Result::Failure;
  }
  auto dv = result.As<DataView>();
  std::shared_ptr<BackingStore> store = dv->Buffer()->GetBackingStore();
  dest->bytes = reinterpret_cast<uint8_t*>(store->Data()) + dv->ByteOffset();
  dest->len = len;
  dest->attributes.is_const = false;
  dest->attributes.is_comptime = false;
  dest->attributes.align = align;
  return Result::OK;
}

static Result FreeRelocatableMemory(Call* call,
                                    const Memory& memory) {
  auto isolate = call->isolate;
  auto fname = String::NewFromUtf8Literal(isolate, "freeRelocatableMemory");
  auto address = reinterpret_cast<size_t>(memory.bytes);
  Local<Value> args[] = {
    BigInt::NewFromUnsigned(isolate, address),
    Number::New(isolate, memory.len),
    Uint32::NewFromUnsigned(isolate, memory.attributes.align),
  };
  Local<Value> result;
  if (CallFunction(call, fname, 3, args, &result) != Result::OK) {
    return Result::Failure;
  }
  return Result::OK;
}

static Result CreateView(Call* call,
                         const Memory& memory,
                         Local<DataView>* dest) {
  auto isolate = call->isolate;
  auto fname = String::NewFromUtf8Literal(isolate, "createView");
  auto address = reinterpret_cast<size_t>(memory.bytes);
  Local<Value> args[] = {
    BigInt::NewFromUnsigned(isolate, address),
    Number::New(isolate, memory.len),
    Boolean::New(isolate, memory.attributes.is_comptime),
  };
  Local<Value> result;
  if (CallFunction(call, fname, 3, args, &result) != Result::OK || !result->IsDataView()) {
    return Result::Failure;
  }
  *dest = result.As<DataView>();
  return Result::OK;
}

static Result CastView(Call* call,
                       Local<Object> structure,
                       Local<DataView> dv,
                       Local<Object>* dest) {
  auto isolate = call->isolate;
  auto fname = String::NewFromUtf8Literal(isolate, "castView");
  Local<Value> args[] = { structure, dv };
  Local<Value> result;
  if (CallFunction(call, fname, 2, args, &result) != Result::OK || !result->IsObject()) {
    return Result::Failure;
  }
  *dest = result.As<Object>();
  return Result::OK;
}

static Result CreateObject(Call* call,
                           Local<Object> structure,
                           Local<Value> arg,
                           Local<Object>* dest) {
  auto isolate = call->isolate;
  auto fname = String::NewFromUtf8Literal(isolate, "createObject");
  Local<Value> args[] = { structure, arg };
  Local<Value> result;
  if (CallFunction(call, fname, 2, args, &result) != Result::OK || !result->IsObject()) {
    return Result::Failure;
  }
  *dest = result.As<Object>();
  return Result::OK;
}

static Result CreateString(Call* call,
                           const Memory& memory,
                           Local<Value>* dest) {
  auto isolate = call->isolate;
  auto chars = reinterpret_cast<const char*>(memory.bytes);
  auto len = memory.len;
  *dest = String::NewFromUtf8(isolate, chars, NewStringType::kNormal, len).ToLocalChecked();
  return Result::OK;
}

static Result CreateTemplate(Call* call,
                             Local<DataView> dv,
                             Local<Object>* dest) {
  auto isolate = call->isolate;
  auto fname = String::NewFromUtf8Literal(isolate, "createTemplate");
  Local<Value> args[] = {
    dv.IsEmpty() ? Null(isolate).As<Value>() : dv.As<Value>()
  };
  Local<Value> result;
  if (CallFunction(call, fname, 1, args, &result) != Result::OK || !result->IsObject()) {
    return Result::Failure;
  }
  *dest = result.As<Object>();
  return Result::OK;
}

static Result ReadSlot(Call* call,
                       Local<Object> object,
                       size_t slot,
                       Local<Value>* dest) {
  auto isolate = call->isolate;
  auto fname = String::NewFromUtf8Literal(isolate, "readSlot");
  Local<Value> args[] = {
    object.IsEmpty() ? Null(isolate).As<Value>() : object.As<Value>(),
    Uint32::NewFromUnsigned(isolate, slot),
  };
  Local<Value> result;
  if (CallFunction(call, fname, 2, args, &result) != Result::OK || !result->IsObject()) {
    return Result::Failure;
  }
  *dest = result;
  return Result::OK;
}

static Result WriteSlot(Call* call,
                        Local<Object> object,
                        size_t slot,
                        Local<Value> value) {
  auto isolate = call->isolate;
  auto fname = String::NewFromUtf8Literal(isolate, "writeSlot");
  Local<Value> args[] = {
    object.IsEmpty() ? Null(isolate).As<Value>() : object.As<Value>(),
    Uint32::NewFromUnsigned(isolate, slot),
    value.IsEmpty() ? Null(isolate).As<Value>() : value,
  };
  Local<Value> result;
  if (CallFunction(call, fname, 3, args, &result) != Result::OK) {
    return Result::Failure;
  }
  return Result::OK;
}

static Result BeginStructure(Call* call,
                             const Structure& structure,
                             Local<Object>* dest) {
  auto isolate = call->isolate;
  auto context = call->context;
  auto def = Object::New(isolate);
  auto type = Int32::New(isolate, static_cast<int32_t>(structure.type));
  auto length = Uint32::NewFromUnsigned(isolate, structure.length);
  auto byte_size = Uint32::NewFromUnsigned(isolate, structure.byte_size);
  auto align = Uint32::NewFromUnsigned(isolate, structure.align);
  auto is_const = Boolean::New(isolate, structure.is_const);
  auto has_pointer = Boolean::New(isolate, structure.has_pointer);
  def->Set(context, String::NewFromUtf8Literal(isolate, "type"), type).Check();
  if (structure.type == StructureType::Array || structure.type == StructureType::Vector) {
    def->Set(context, String::NewFromUtf8Literal(isolate, "length"), length).Check();
  }
  def->Set(context, String::NewFromUtf8Literal(isolate, "byteSize"), byte_size).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "align"), align).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "isConst"), is_const).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "hasPointer"), has_pointer).Check();
  if (structure.name) {
    auto name = String::NewFromUtf8(isolate, structure.name).ToLocalChecked();
    def->Set(context, String::NewFromUtf8Literal(isolate, "name"), name).Check();
  }
  auto mde = Local<External>::New(isolate, call->function_data->module_data);
  auto md = reinterpret_cast<ModuleData*>(mde->Value());
  auto fname = String::NewFromUtf8Literal(isolate, "beginStructure");
  Local<Value> args[2] = {
    def,
    Local<Object>::New(isolate, md->js_options),
  };
  Local<Value> result;
  if (CallFunction(call, fname, 2, args, &result) != Result::OK || !result->IsObject()) {
    return Result::Failure;
  }
  *dest = result.As<Object>();
  return Result::OK;
}

static Result AttachMember(Call* call,
                           Local<Object> structure,
                           const Member& member,
                           bool is_static) {
  auto isolate = call->isolate;
  auto context = call->context;
  auto name = String::NewFromUtf8Literal(isolate, "attachMember");
  auto def = Object::New(isolate);
  auto type = Int32::New(isolate, static_cast<int32_t>(member.type));
  auto is_required = Boolean::New(isolate, member.is_required);
  def->Set(context, String::NewFromUtf8Literal(isolate, "type"), type).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "isRequired"), is_required).Check();
  if (member.bit_size != missing) {
    auto bit_size = Uint32::NewFromUnsigned(isolate, member.bit_size);
    def->Set(context, String::NewFromUtf8Literal(isolate, "bitSize"), bit_size).Check();
  }
  if (member.bit_offset != missing) {
    auto bit_offset = Uint32::NewFromUnsigned(isolate, member.bit_offset);
    def->Set(context, String::NewFromUtf8Literal(isolate, "bitOffset"), bit_offset).Check();
  }
  if (member.byte_size != missing) {
    auto byte_size = Uint32::NewFromUnsigned(isolate, member.byte_size);
    def->Set(context, String::NewFromUtf8Literal(isolate, "byteSize"), byte_size).Check();
  }
  if (member.slot != missing) {
    auto slot = Uint32::NewFromUnsigned(isolate, member.slot);
    def->Set(context, String::NewFromUtf8Literal(isolate, "slot"), slot).Check();
  }
  if (!member.structure.IsEmpty()) {
    def->Set(context, String::NewFromUtf8Literal(isolate, "structure"), member.structure).Check();
  }
  if (member.name) {
    auto name = String::NewFromUtf8(isolate, member.name).ToLocalChecked();
    def->Set(context, String::NewFromUtf8Literal(isolate, "name"), name).Check();
  }
  Local<Value> args[3] = {
    structure,
    def,
    Boolean::New(isolate, is_static),
  };
  return CallFunction(call, name, 3, args);
}

static Result AttachMethod(Call* call,
                           Local<Object> structure,
                           const Method& method,
                           bool is_static_only) {
  auto isolate = call->isolate;
  auto context = call->context;
  auto mde = Local<External>::New(isolate, call->function_data->module_data);
  auto fd = new FunctionData(isolate, method.thunk, method.attributes, mde);
  auto thunk = CreateThunk(isolate, fd);
  auto def = Object::New(isolate);
  def->Set(context, String::NewFromUtf8Literal(isolate, "argStruct"), method.structure).Check();
  def->Set(context, String::NewFromUtf8Literal(isolate, "thunk"), thunk).Check();
  if (method.name) {
    auto name = String::NewFromUtf8(isolate, method.name).ToLocalChecked();
    def->Set(context, String::NewFromUtf8Literal(isolate, "name"), name).Check();
  }
  auto fname = String::NewFromUtf8Literal(isolate, "attachMethod");
  Local<Value> args[] = {
    structure,
    def,
    Boolean::New(isolate, is_static_only),
  };
  return CallFunction(call, fname, 3, args);
}

static Result AttachTemplate(Call* call,
                             Local<Object> structure,
                             Local<Object> templateObj,
                             bool is_static) {
  auto isolate = call->isolate;
  auto fname = String::NewFromUtf8Literal(isolate, "attachTemplate");
  Local<Value> args[] = {
    structure,
    templateObj,
    Boolean::New(isolate, is_static),
  };
  return CallFunction(call, fname, 3, args);
}

static Result FinalizeStructure(Call* call,
                                Local<Object> structure) {
  auto isolate = call->isolate;
  auto fname = String::NewFromUtf8Literal(isolate, "finalizeStructure");
  Local<Value> args[] = { structure };
  return CallFunction(call, fname, 1, args);
}

static Result WriteToConsole(Call* call,
                             Local<DataView> dv) {
  auto isolate = call->isolate;
  auto name = String::NewFromUtf8Literal(isolate, "writeToConsole");
  Local<Value> args[] = { dv };
  return CallFunction(call, name, 1, args);
}

static Result FlushConsole(Call* call) {
  auto isolate = call->isolate;
  auto name = String::NewFromUtf8Literal(isolate, "flushConsole");
  return CallFunction(call, name, 0, nullptr);
}

static MaybeLocal<Value> LoadJavaScript(Isolate* isolate,
                                        AddonData* ad) {
  auto context = isolate->GetCurrentContext();
  Local<Script> script;
  if (ad->js_script.IsEmpty()) {
    // compile the code
    auto source = String::NewFromUtf8Literal(isolate,
      #include "addon.js.txt"
    );
    if (!Script::Compile(context, source).ToLocal(&script)) {
      return Null(isolate);
    }
    // save the script but allow it to be gc'ed--it's needed only when
    // Node starts and multiple Zigar modules are being loaded
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
  // run iife
  return script->Run(context);
}

static Local<DataView> CreateSharedView(Isolate* isolate,
                                        uint8_t* src_bytes,
                                        size_t len,
                                        Local<External> module_data) {
  // create a reference to the module so that the shared library doesn't get unloaded
  // while the shared buffer is still around pointing to it
  auto emd = new ExternalMemoryData(isolate, module_data);
  std::shared_ptr<BackingStore> store = SharedArrayBuffer::NewBackingStore(src_bytes, len, [](void*, size_t, void* deleter_data) {
    // get rid of the reference
    auto emd = reinterpret_cast<ExternalMemoryData*>(deleter_data);
    delete emd;
  }, emd);
  auto buffer = SharedArrayBuffer::New(isolate, store);
  return DataView::New(buffer, 0, len);
}

static void OverrideEnvironmentFunctions(Isolate* isolate,
                                         Local<Function> constructor,
                                         Local<External> module_data) {
  auto context = isolate->GetCurrentContext();
  auto prototype = constructor->Get(context, String::NewFromUtf8Literal(isolate, "prototype")).ToLocalChecked().As<Object>();
  auto add = [&](Local<String> name, void (*f)(const FunctionCallbackInfo<Value>& info), int length) {
    auto tmpl = FunctionTemplate::New(isolate, f, module_data, Local<Signature>(), length, ConstructorBehavior::kThrow, SideEffectType::kHasNoSideEffect);
    auto function = tmpl->GetFunction(isolate->GetCurrentContext()).ToLocalChecked();
    prototype->Set(context, name, function).Check();
  };
  add(String::NewFromUtf8Literal(isolate, "getBufferAddress"), [](const FunctionCallbackInfo<Value>& info) {
    auto isolate = info.GetIsolate();
    if (!(info[0]->IsArrayBuffer() || info[0]->IsSharedArrayBuffer())) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Argument must be ArrayBuffer or SharedArrayBuffer").ToLocalChecked()));
      return;
    }
    if (info[0]->IsArrayBuffer()) {
      auto buffer = info[0].As<ArrayBuffer>();
      auto store = buffer->GetBackingStore();
      auto address = reinterpret_cast<size_t>(store->Data());
      auto big_int = BigInt::NewFromUnsigned(isolate, address);
      info.GetReturnValue().Set(big_int);
    } else {
      auto buffer = info[0].As<SharedArrayBuffer>();
      auto store = buffer->GetBackingStore();
      auto address = reinterpret_cast<size_t>(store->Data());
      auto big_int = BigInt::NewFromUnsigned(isolate, address);
      info.GetReturnValue().Set(big_int);
    }
  }, 1);
  add(String::NewFromUtf8Literal(isolate, "allocateFixedMemory"), [](const FunctionCallbackInfo<Value>& info) {
    auto isolate = info.GetIsolate();
    if (!info[0]->IsNumber()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Length must be number").ToLocalChecked()));
      return;
    }
    if (!info[1]->IsNumber()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Align must be number").ToLocalChecked()));
      return;
    }
    auto mde = info.Data().As<External>();
    auto md = reinterpret_cast<ModuleData*>(mde->Value());
    auto len = info[0].As<Number>()->Value();
    auto align = info[1].As<Number>()->Value();
    Memory memory;
    if (md->imports->allocate_fixed_memory(len, align, &memory) == Result::OK) {
      auto dv = CreateSharedView(isolate, memory.bytes, memory.len, mde);
      info.GetReturnValue().Set(dv);
    }

  }, 2);
  add(String::NewFromUtf8Literal(isolate, "freeFixedMemory"), [](const FunctionCallbackInfo<Value>& info) {
    auto isolate = info.GetIsolate();
    if (!info[0]->IsBigInt()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Address must be bigInt").ToLocalChecked()));
      return;
    }
    if (!info[1]->IsNumber()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Length must be number").ToLocalChecked()));
      return;
    }
    if (!info[2]->IsNumber()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Align must be number").ToLocalChecked()));
      return;
    }
    auto mde = info.Data().As<External>();
    auto md = reinterpret_cast<ModuleData*>(mde->Value());
    auto address = info[0].As<BigInt>()->Uint64Value();
    auto len = info[1].As<Number>()->Value();
    auto align = info[2].As<Number>()->Value();
    Memory memory = {
      reinterpret_cast<uint8_t*>(address),
      static_cast<size_t>(len),
      { static_cast<uint16_t>(align), false, false }
    };
    md->imports->free_fixed_memory(memory);
  }, 3);
  add(String::NewFromUtf8Literal(isolate, "obtainFixedView"), [](const FunctionCallbackInfo<Value>& info) {
    auto isolate = info.GetIsolate();
    if (!info[0]->IsBigInt()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Address must be bigInt").ToLocalChecked()));
      return;
    }
    if (!info[1]->IsNumber()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Length must be number").ToLocalChecked()));
      return;
    }
    auto mde = info.Data().As<External>();
    auto address = info[0].As<BigInt>()->Uint64Value();
    auto len = info[1].As<Number>()->Value();
    auto src_bytes = reinterpret_cast<uint8_t*>(address);
    auto dv = CreateSharedView(isolate, src_bytes, len, mde);
    info.GetReturnValue().Set(dv);
  }, 2);
  add(String::NewFromUtf8Literal(isolate, "copyBytes"), [](const FunctionCallbackInfo<Value>& info) {
    auto isolate = info.GetIsolate();
    if (!info[0]->IsDataView()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Destination must be DataView").ToLocalChecked()));
      return;
    }
    if (!info[1]->IsBigInt()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Address must be bigInt").ToLocalChecked()));
      return;
    }
    if (!info[2]->IsNumber()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Length must be number").ToLocalChecked()));
      return;
    }
    auto dst = info[0].As<DataView>();
    auto address = info[1].As<BigInt>()->Uint64Value();
    auto len = info[2].As<Number>()->Value();
    if (dst->ByteLength() != len) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Length mismatch").ToLocalChecked()));
      return;
    }
    auto src_bytes = reinterpret_cast<const uint8_t*>(address);
    auto dst_store = dst->Buffer()->GetBackingStore();
    auto dst_bytes = reinterpret_cast<uint8_t*>(dst_store->Data()) + dst->ByteOffset();
    memcpy(dst_bytes, src_bytes, len);
  }, 3);
  add(String::NewFromUtf8Literal(isolate, "findSentinel"), [](const FunctionCallbackInfo<Value>& info) {
    auto isolate = info.GetIsolate();
    if (!info[0]->IsBigInt()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Address must be bigInt").ToLocalChecked()));
      return;
    }
    if (!info[1]->IsDataView()) {
      isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Sentinel value must be DataView").ToLocalChecked()));
      return;
    }
    auto address = info[0].As<BigInt>()->Uint64Value();
    auto sentinel = info[1].As<DataView>();
    auto sentinel_store = sentinel->Buffer()->GetBackingStore();
    auto sentinel_bytes = reinterpret_cast<uint8_t*>(sentinel_store->Data()) + sentinel->ByteOffset();
    auto sentinel_len = sentinel->ByteLength();
    auto src_bytes = reinterpret_cast<const uint8_t*>(address);
    if (sentinel_len > 0) {
      for (int32_t i = 0, j = 0; i < INT32_MAX; i += sentinel_len, j++) {
        if (memcmp(src_bytes + i, sentinel_bytes, sentinel_len) == 0) {
          info.GetReturnValue().Set(j);
          break;
        }
      }
    }
  }, 2);
}

static void Load(const FunctionCallbackInfo<Value>& info) {
  auto isolate = info.GetIsolate();
  auto context = isolate->GetCurrentContext();
  auto Throw = [&](const char* message) {
    Local<String> string;
    if (String::NewFromUtf8(isolate, message).ToLocal<String>(&string)) {
      isolate->ThrowException(Exception::Error(string));
    }
  };

  // check arguments
  if (info.Length() < 1 || !info[0]->IsString()) {
    Throw("Invalid arguments");
    return;
  }

  // load the shared library
	String::Utf8Value path(isolate, info[0]);
  void* handle = dlopen(*path, RTLD_NOW);
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

  // load JavaScript
  auto ade = info.Data().As<External>();
  auto ad = reinterpret_cast<AddonData*>(ade->Value());
  Local<Value> result;
  if (!LoadJavaScript(isolate, ad).ToLocal(&result) || !result->IsObject()) {
    Throw("Unable to compile embedded JavaScript");
    return;
  }
  auto js_module = result.As<Object>();
  // look for the Environment class
  if (!js_module->Get(context, String::NewFromUtf8Literal(isolate, "Environment")).ToLocal(&result) || !result->IsObject()) {
    Throw("Unable to find the class \"Environment\"");
    return;
  }
  auto env_constructor = result.As<Function>();

  // attach exports to module
  auto module = reinterpret_cast<::Module*>(symbol);
  if (module->version != 2) {
    Throw("Cached module is compiled for a different version of Zigar");
    return;
  }
  auto exports = module->exports;
  exports->allocate_relocatable_memory = AllocateRelocatableMemory;
  exports->free_relocatable_memory = FreeRelocatableMemory;
  exports->create_string = CreateString;
  exports->create_object = CreateObject;
  exports->create_view = CreateView;
  exports->cast_view = CastView;
  exports->read_slot = ReadSlot;
  exports->write_slot = WriteSlot;
  exports->begin_structure = BeginStructure;
  exports->attach_member = AttachMember;
  exports->attach_method = AttachMethod;
  exports->attach_template = AttachTemplate;
  exports->finalize_structure = FinalizeStructure;
  exports->create_template = CreateTemplate;
  exports->write_to_console = WriteToConsole;
  exports->flush_console = FlushConsole;

  // save handle to external object, along with options and AddonData
  auto options = Object::New(isolate);
  auto little_endian = Boolean::New(isolate, module->attributes.little_endian);
  auto runtime_safety = Boolean::New(isolate, module->attributes.runtime_safety);
  options->Set(context, String::NewFromUtf8Literal(isolate, "littleEndian"), little_endian).Check();
  options->Set(context, String::NewFromUtf8Literal(isolate, "runtimeSafety"), runtime_safety).Check();
  auto md = new ModuleData(isolate, handle, module->imports, options, ade);
  auto mde = Local<External>::New(isolate, md->external);

  // add functions to Environment
  OverrideEnvironmentFunctions(isolate, env_constructor, mde);

  // invoke the factory thunk through JavaScript
  auto fd = new FunctionData(isolate, module->factory, MethodAttributes{ false }, mde);
  auto fde = Local<External>::New(isolate, fd->external);
  auto ff = CreateThunk(isolate, fd);
  auto env = env_constructor->CallAsConstructor(context, 0, nullptr).ToLocalChecked().As<Object>();
  auto name = String::NewFromUtf8Literal(isolate, "invokeFactory");
  Local<Value> args[1] = { ff };
  Call ctx(isolate, env, fde);
  if (CallFunction(&ctx, name, 1, args, &result) != Result::OK) {
    // an error should have been thrown already
    return;
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

DISABLE_WCAST_FUNCTION_TYPE
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
DISABLE_WCAST_FUNCTION_TYPE_END

int AddonData::script_count = 0;
int ModuleData::count = 0;
int FunctionData::count = 0;
int ExternalMemoryData::count = 0;
