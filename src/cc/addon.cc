#include <limits>
#include <cmath>
#include "addon.h"

//-----------------------------------------------------------------------------
//  Utility functions
//-----------------------------------------------------------------------------
static Local<String> 
NewString(Isolate* isolate, const char* s) {
  return String::NewFromUtf8(isolate, s).ToLocalChecked();
}

static Local<Number> 
NewInteger(Isolate* isolate, int64_t value) {
  if (value >= INT32_MIN && value <= INT32_MAX) {
    return Int32::New(isolate, static_cast<int64_t>(value));
  } else if (value >= MIN_SAFE_INTEGER && value <= MAX_SAFE_INTEGER) {
    return Number::New(isolate, (double) value);
  } else {
    return Number::New(isolate, std::numeric_limits<double>::quiet_NaN());
  }
}

static Local<v8::Function> 
NewFunction(Isolate* isolate, FunctionCallback f, int len, Local<Value> data = Local<Value>()) {
  Local<Signature> signature;
  Local<FunctionTemplate> ftmpl = FunctionTemplate::New(isolate, f, data, signature, len);
  return ftmpl->GetFunction(isolate->GetCurrentContext()).ToLocalChecked();
}

static void 
SetProperty(Isolate* isolate, const char *name, Local<Value> object, Local<Value> value) {
  Local<String> key = NewString(isolate, name);
  object.As<Object>()->Set(isolate->GetCurrentContext(), key, value).Check();
}

static void 
ThrowException(Isolate* isolate, const char* message) {
  Local<String> string = NewString(isolate, message);
  Local<Value> error = Exception::Error(string);
  isolate->ThrowException(error);
}

static Local<Value> 
AllocateExternal(Isolate* isolate, size_t count) {
  struct SetWeakCallbackData {
    Global<Value> global;
    int64_t payload[1]; 
  };
  // allocate enough memory to hold the global and the payload
  size_t total_size = sizeof(SetWeakCallbackData) - sizeof(int64_t) + count;
  uint8_t* bytes = new uint8_t[total_size];
  memset(bytes, 0, total_size);
  SetWeakCallbackData *callback_data = reinterpret_cast<SetWeakCallbackData *>(bytes);
  // create a v8::External and attach it to global ref
  Local<Value> external = External::New(isolate, callback_data->payload);
  callback_data->global.Reset(isolate, external);
  // use SetWeak to invoke a callback when the External gets gc'ed
  auto callback = [](const v8::WeakCallbackInfo<SetWeakCallbackData>& data) {
    SetWeakCallbackData* callback_data = data.GetParameter();
    callback_data->global.Reset();
    delete callback_data;
  };
  callback_data->global.template 
    SetWeak<SetWeakCallbackData>(callback_data, callback, WeakCallbackType::kParameter);
  return external;
}

static ::TypedArray 
GetMemory(Local<ArrayBuffer> arBuf) {
  std::shared_ptr<BackingStore> store = arBuf->GetBackingStore();
  ::TypedArray array;
  array.type = ElementType::u8;
  array.bytes = reinterpret_cast<uint8_t*>(store->Data());
  array.len = store->ByteLength();
  return array;
}

//-----------------------------------------------------------------------------
//  Callback functions that zig modules will invoke
//-----------------------------------------------------------------------------
static size_t 
GetArgumentCount(CallContext* call) {
  return call->node_args->Length();
}

static Local<Value> 
GetArgument(CallContext* call, size_t index) {
  Local<Value> value = (*call->node_args)[index];
  // unwrap scalar objects
  if (value->IsBooleanObject()) {
    value = Boolean::New(call->isolate, value.As<BooleanObject>()->ValueOf());
  } else if (value->IsStringObject()) {
    value = value.As<StringObject>()->ValueOf();
  } else if (value->IsNumberObject()) {
    value = Number::New(call->isolate, value.As<NumberObject>()->ValueOf());
  } else if (value->IsBigIntObject()) {
    value = value.As<BigIntObject>()->ValueOf();
  }
  return value;
}

static ValueMask 
GetArgumentType(CallContext* call, size_t index) {
  return call->zig_func->argument_types[index];
}

static ValueMask 
GetReturnType(CallContext* call) {
  return call->zig_func->return_type;
}

static void 
SetReturnValue(CallContext* call, Local<Value> value) {
  if (!value.IsEmpty()) {
    call->node_args->GetReturnValue().Set(value);
  }
}

static Result 
GetProperty(CallContext* call, const char *name, Local<Value> object, Local<Value>* dest) {
  Local<Value> key = NewString(call->isolate, name);
  MaybeLocal<Value> result = object.As<Object>()->Get(call->exec_context, key);
  if (result.IsEmpty()) {
    return Result::eGeneric;
  }
  *dest = result.ToLocalChecked();
  return Result::ok;
}

static Result
SetProperty(CallContext* call, const char *name, Local<Value> object, Local<Value> value) {
  Local<Value> key = NewString(call->isolate, name);
  object.As<Object>()->Set(call->exec_context, key, value).Check();
  return Result::ok;
}

static Result
AllocateMemory(CallContext* call, size_t size, ::TypedArray* dest) {
  if (call->mem_pool.IsEmpty()) {
    call->mem_pool = Array::New(call->isolate);
  }
  Local<ArrayBuffer> buffer = ArrayBuffer::New(call->isolate, size);
  uint32_t index = call->mem_pool->Length();
  Local<Context> context = call->isolate->GetCurrentContext();
  call->mem_pool->Set(context, index, buffer).Check();
  *dest = GetMemory(buffer);
  return Result::ok;
}

static bool 
IsNull(Local<Value> value) {
  return value->IsNullOrUndefined();
}

static bool 
IsValueType(Local<Value> value, ValueMask mask) {
  bool match = (mask.boolean && value->IsBoolean())
            || (mask.number && value->IsNumber())
            || (mask.bigInt && value->IsBigInt())
            || (mask.string && value->IsString())
            || (mask.array && value->IsArray())
            || (mask.object && value->IsObject())
            || (mask.function && value->IsFunction())
            || (mask.arrayBuffer && value->IsArrayBuffer())
            || (mask.i8Array && value->IsInt8Array())
            || (mask.u8Array && (value->IsUint8Array() || value->IsUint8ClampedArray()))
            || (mask.i16Array && value->IsInt16Array())
            || (mask.u16Array && value->IsUint16Array())
            || (mask.i32Array && value->IsInt32Array())
            || (mask.u32Array && value->IsUint32Array())
            || (mask.i64Array && value->IsBigInt64Array())
            || (mask.u64Array && value->IsBigUint64Array())
            || (mask.f32Array && value->IsFloat32Array())
            || (mask.f64Array && value->IsFloat64Array());
  return match;
}

static Result 
ConvertToBool(CallContext* call, Local<Value> value, bool* dest) {
  if (value->IsBoolean()) {
    *dest = value.As<Boolean>()->Value();
    return Result::ok;
  }
  return Result::eGeneric;
}

static Result 
ConvertFromBool(CallContext* call, bool value, Local<Value>* dest) {
  *dest = Boolean::New(call->isolate, value);
  return Result::ok;
}

static Result 
ConvertToInteger(CallContext* call, Local<Value> value, int64_t* dest) {
  if (value->IsInt32()) {
    *dest = value.As<Int32>()->Value();
  } else if (value->IsNumber()) {
    double fvalue = value.As<Number>()->Value();
    *dest = static_cast<int64_t>(fvalue);
  } else if (value->IsBigInt()) {
    bool lossless;
    int64_t ivalue = value.As<BigInt>()->Int64Value(&lossless);
    if (!lossless) {
      return Result::eOverflow;
    }
    *dest = ivalue;
  } else {
    return Result::eGeneric;
  }
  return Result::ok;
}

static Result 
ConvertFromInteger(CallContext* call, int64_t value, Local<Value>* dest) {
  if (INT32_MIN <= value && value <= INT32_MAX) {
    *dest = Int32::New(call->isolate, value);
  } else if (MIN_SAFE_INTEGER <= value && value <= MAX_SAFE_INTEGER) {
    *dest = Number::New(call->isolate, value);
  } else {
    *dest = BigInt::New(call->isolate, value);
  }
  return Result::ok;
}

static Result 
ConvertToFloat(CallContext* call, Local<Value> value, double* dest) {
  if (value->IsNumber()) {
    *dest = value.As<Number>()->Value();
  } else if (value->IsBigInt()) {
    MaybeLocal<Number> result = value.As<BigInt>()->ToNumber(call->exec_context);
    if (result.IsEmpty()) {
      return Result::eGeneric;
    }
    Local<Number> number = result.ToLocalChecked();
    double fvalue = number->Value();
    if (!std::isfinite(fvalue)) {
      return Result::eOverflow;
    }
    *dest = fvalue;
  }
  return Result::ok;
}

static Result 
ConvertFromFloat(CallContext* call, double value, Local<Value>* dest) {
  *dest = Number::New(call->isolate, value);
  return Result::ok;
}

static Result 
ConvertToUTF8(CallContext* call, Local<Value> value, ::TypedArray* dest) {
  Local<String> string;
  if (value->IsString()) {
    string = value.As<String>();
  } else {
    MaybeLocal<String> result = value->ToString(call->exec_context);
    if (result.IsEmpty()) {
      return Result::eGeneric;
    }
    string = result.ToLocalChecked();
  }
  size_t len = string->Length();
  if (AllocateMemory(call, (len + 1) * sizeof(uint8_t), dest) != Result::ok) {
    return Result::eGeneric;
  }
  string->WriteUtf8(call->isolate, reinterpret_cast<char*>(dest->bytes));
  return Result::ok;
}

static Result
ConvertToUTF16(CallContext* call, Local<Value> value, ::TypedArray* dest) {
  Local<String> string;
  if (value->IsString()) {
    string = value.As<String>();
  } else {
    MaybeLocal<String> result = value->ToString(call->exec_context);
    if (result.IsEmpty()) {
      return Result::eGeneric;
    }
    string = result.ToLocalChecked();
  }
  size_t len = string->Length();
  if (AllocateMemory(call, (len + 1) * sizeof(uint16_t), dest) != Result::ok) {
    return Result::eGeneric;
  }
  string->Write(call->isolate, reinterpret_cast<uint16_t*>(dest->bytes));
  return Result::ok;
}

static Result
ConvertToTypedArray(CallContext* call, Local<Value> value, ::TypedArray* dest) {
  Local<ArrayBuffer> buffer;
  size_t offset = 0;
  if (value->IsArrayBuffer()) {
    buffer = value.As<ArrayBuffer>();
  } else if (value->IsTypedArray()) {
    buffer = value.As<v8::TypedArray>()->Buffer();
    offset = value.As<v8::TypedArray>()->ByteOffset();
  } else {
    return Result::eGeneric;
  }    
  *dest = GetMemory(buffer);
  if (offset > 0) {
    dest->bytes += offset;
    dest->len -= offset;
  }
  return Result::ok;
}

static void 
ThrowException(CallContext* call, const char* message) {
  Local<Value> error = Exception::Error(NewString(call->isolate, message));
  call->isolate->ThrowException(error);
}

//-----------------------------------------------------------------------------
//  Functions that create V8-to-Zig bridging functions
//-----------------------------------------------------------------------------
static FunctionData* 
AllocateFunctionData(Isolate* isolate, size_t arg_count, const Entry *entry, Local<Value>& external) {
  // allocate memory for the FunctionData struct, enough for holding the current 
  // type set for each argument
  size_t size = sizeof(FunctionData) + sizeof(ValueMask) * arg_count;
  external = AllocateExternal(isolate, size);
  auto fd = reinterpret_cast<FunctionData*>(external.As<External>()->Value());
  fd->entry = *entry;
  return fd;
}

static void
ProcessFunctionEntry(Isolate* isolate, const Entry *entry, Local<Value> container) {
  size_t arg_count = entry->function->argument_count;
  const Argument *args = entry->function->arguments;
  // save argument and return types
  Local<Value> external;
  FunctionData *fd = AllocateFunctionData(isolate, arg_count, entry, external);
  for (size_t i = 0; i < arg_count; i++) {
    fd->argument_types[i] = args[i].default_type;
  }
  fd->return_type = entry->function->return_default_type;
  // calls the Zig-generate thunk when V8 function is called
  Local<v8::Function> function = NewFunction(isolate, 
    [](const FunctionCallbackInfo<Value>& info) {
      CallContext ctx(info);
      ctx.zig_func->entry.function->thunk(&ctx);
    }, arg_count, external);
  SetProperty(isolate, entry->name, container, function);
}

static void 
ProcessVariableEntry(Isolate* isolate, const Entry* entry, Local<Value> container) {
  Local<Value> external;
  FunctionData *fd = AllocateFunctionData(isolate, 1, entry, external);
  fd->argument_types[0] = entry->variable->default_type;
  fd->return_type = entry->variable->default_type;
  PropertyAttribute attribute = static_cast<PropertyAttribute>(DontDelete | ReadOnly);
  Local<v8::Function> getter, setter;
  if (entry->variable->getter_thunk) {
    getter = NewFunction(isolate, 
      [](const FunctionCallbackInfo<Value>& info) {
        CallContext ctx(info);
        ctx.zig_func->entry.variable->getter_thunk(&ctx);
      }, 0, external);
  }
  if (entry->variable->setter_thunk) {
    setter = NewFunction(isolate, 
      [](const FunctionCallbackInfo<Value>& info) {
        CallContext ctx(info);
        ctx.zig_func->entry.variable->setter_thunk(&ctx);
      }, 1, external);
    attribute = static_cast<PropertyAttribute>(attribute & ~ReadOnly);
  }
  Local<String> name = NewString(isolate, entry->name);
  container.As<Object>()->SetAccessorProperty(name, getter, setter, attribute);
}

static void 
ProcessEnumerationEntry(Isolate* isolate, const Entry* entry, Local<Value> container) {
  Local<Value> external;
  FunctionData *fd = AllocateFunctionData(isolate, 0, entry, external);
  fd->return_type = entry->enumeration->default_type;
  Local<Value> enumeration = Object::New(isolate);
  for (size_t i = 0; i < entry->enumeration->count; i++) {
    const EnumerationItem* item = &entry->enumeration->items[i];
    Local<Number> number = NewInteger(isolate, item->value);
    SetProperty(isolate, item->name, enumeration, number);
  }
  SetProperty(isolate, entry->name, container, enumeration);
}

static Local<Value> 
ProcessEntryTable(Isolate* isolate, EntryTable *table) {
  Local<Value> object = Object::New(isolate);
  for (size_t i = 0; i < table->count; i++) {
    const Entry* entry = &table->entries[i];
    switch (entry->type) {
      case EntryType::function: 
        ProcessFunctionEntry(isolate, entry, object);
        break;
      case EntryType::variable: 
        ProcessVariableEntry(isolate, entry, object);
        break;
      case EntryType::enumeration:
        ProcessEnumerationEntry(isolate, entry, object);
        break;
      case EntryType::unavailable:
        break;
    }
  }
  return object;
}

//-----------------------------------------------------------------------------
//  Function for loading Zig modules
//-----------------------------------------------------------------------------
static void 
Load(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();

  // check arguments
  if (info.Length() < 1 || !info[0]->IsString()) {
    ThrowException(isolate, "Invalid arguments");
    return;
  }

  // load the shared library
	String::Utf8Value path(isolate, info[0]);
  void* handle = dlopen(*path, RTLD_LAZY);
  if (!handle) {
    ThrowException(isolate, "Unable to load shared library");
    return;
  }

  // find the zig module
  void* symbol = dlsym(handle, "zig_module");
  if (!symbol) {
    ThrowException(isolate, "Unable to find the symbol \"zig_module\"");
    return;
  }

  // attach callbacks to module
  ::Module* module = reinterpret_cast<::Module*>(symbol);
  Callbacks* callbacks = module->callbacks;
  callbacks->get_argument_count = GetArgumentCount;
  callbacks->get_argument = GetArgument;
  callbacks->get_argument_type = GetArgumentType;
  callbacks->get_return_type = GetReturnType;
  callbacks->set_return_value = SetReturnValue;
  callbacks->is_null = IsNull;
  callbacks->is_value_type = IsValueType;
  callbacks->get_property = GetProperty;
  callbacks->set_property = SetProperty;
  callbacks->get_array_length = nullptr;
  callbacks->get_array_item = nullptr;
  callbacks->set_array_item = nullptr;
  callbacks->convert_to_bool = ConvertToBool;
  callbacks->convert_to_integer = ConvertToInteger;
  callbacks->convert_to_float = ConvertToFloat;
  callbacks->convert_to_utf8 = ConvertToUTF8;
  callbacks->convert_to_utf16 = ConvertToUTF16;
  callbacks->convert_to_typed_array = ConvertToTypedArray;
  callbacks->convert_from_bool = ConvertFromBool;
  callbacks->convert_from_integer = ConvertFromInteger;
  callbacks->convert_from_float = ConvertFromFloat;
  callbacks->convert_from_utf8 = nullptr; // ConvertFromUTF8;
  callbacks->convert_from_utf16 = nullptr; // ConvertFromUTF16;
  callbacks->convert_from_typed_array = nullptr; // ConvertFromTypedArray;

  callbacks->throw_exception = ThrowException;

  // process all entries inside modules
  Local<Value> value = ProcessEntryTable(isolate, &module->table);
  info.GetReturnValue().Set(value);

  // unload shared library on shutdown
  node::AddEnvironmentCleanupHook(isolate, [](void *handle) { 
    dlclose(handle); 
  }, handle);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  Isolate* isolate = context->GetIsolate();
  Local<v8::Function> function = NewFunction(isolate, Load, 1);
  SetProperty(isolate, "load", exports, function);
} 
