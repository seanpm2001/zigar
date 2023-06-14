#include <node.h>
#include <dlfcn.h>

using namespace v8;

//-----------------------------------------------------------------------------
//  Enum and structs used by both Zig and C++ code
//  (need to keep these in sync with their Zig definitions)
//-----------------------------------------------------------------------------
enum class Result : int {
  OK = 0,
  Failure = 1,
};

enum class StructureType : uint32_t {
  Primitive = 0,
  Array,
  Struct,
  ExternUnion,
  TaggedUnion,
  ErrorUnion,
  Enumeration,
  Optional,
  Opaque,
};

enum class MemberType : uint32_t {
  Void = 0,
  Bool,
  Int,
  Float,
  Enum,
  Compound,
  Pointer,
};

struct Memory {
  uint8_t *bytes;
  size_t len;
};

struct Member {
  const char* name;
  MemberType type;
  bool is_signed;
  uint32_t bit_offset;
  uint32_t bit_size;
  uint32_t byte_size;
  Local<Value> structure;
};

struct MemberSet {
  const Member *members;
  size_t member_count;
  Memory default_data;
  const Memory *default_pointers;
  size_t default_pointer_count ;
};

struct Host;
typedef void (*Thunk)(Host*, Local<Value>);

struct Method {
  const char *name;  
  bool is_static_only;
  Thunk thunk;
  Local<Value> structure;
};

struct MethodSet {
  const Method *methods;
  size_t method_count;
};

union ModuleFlags {
  struct {
    bool little_endian: 1;
    bool runtime_safety: 1;
  };
  uint32_t flags;
};

struct Callbacks;
typedef Result (*Factory)(Host*, Local<Value>*);

struct Module {
  uint32_t version;
  ModuleFlags flags;
  Callbacks* callbacks;
  Factory factory;
};

//-----------------------------------------------------------------------------
//  Function-pointer table used by Zig code
//-----------------------------------------------------------------------------
struct Callbacks {
  Result (*allocate_memory)(Host*, size_t, Memory*);
  Result (*reallocate_memory)(Host*, size_t, Memory*);
  Result (*free_memory)(Host*, Memory*);
  Result (*get_memory)(Host*, Local<Object>, Memory*);
  Result (*get_relocatable)(Host*, Local<Object>, uint32_t, Memory*);

  Result (*get_slot)(Host*, size_t, Local<Value>*);
  Result (*set_slot)(Host*, size_t, Local<Value>);

  Result (*create_structure)(Host*, StructureType, const char*, Local<Object>*);
  Result (*shape_structure)(Host*, Local<Object>, const MemberSet*);
  Result (*attach_variables)(Host*, Local<Object>, const MemberSet*);
  Result (*attach_methods)(Host*, Local<Object>, const MethodSet*);
};

//-----------------------------------------------------------------------------
//  Per isolate data structures 
//-----------------------------------------------------------------------------
struct ExternalData {
  Global<External> external;

  ExternalData(Isolate* isolate) :
    external(isolate, External::New(isolate, this)) {
    external.template SetWeak<ExternalData>(this, 
      [](const v8::WeakCallbackInfo<ExternalData>& data) {
        ExternalData* self = data.GetParameter();
        self->external.Reset();
        delete self;
      }, WeakCallbackType::kParameter);
  }

  virtual ~ExternalData() = 0;
};

struct AddonData : public ExternalData {
  Global<Object> js_module;

  AddonData(Isolate* isolate) :
    ExternalData(isolate) {}

  ~AddonData() {}
};

struct ModuleData : public ExternalData {
  static int count;
  void *so_handle;

  ModuleData(Isolate* isolate, 
             void* so_handle) : 
    ExternalData(isolate), 
    so_handle(so_handle) {
    count++;
  }

  ~ModuleData() {
    dlclose(so_handle);
    count--;
  }
};

struct FunctionData : public ExternalData {  
  static int count;
  Thunk thunk;
  Global<Object> slots;
  Global<External> module_data;

  FunctionData(Isolate* isolate, 
               Thunk thunk, 
               Local<External> module_data) :
    ExternalData(isolate),
    thunk(thunk),
    slots(isolate, Object::New(isolate)),
    module_data(isolate, module_data) {
    count++;
  }

  ~FunctionData() {
    count--;
  }
};

//-----------------------------------------------------------------------------
//  Structure holding references used during function import (per call)
//-----------------------------------------------------------------------------
struct JSBridge {
  Isolate* isolate;
  Local<Context> context;

  Local<Function> create_structure;
  Local<Function> shape_structure;
  Local<Function> attach_variables;
  Local<Function> attach_methods;

  Local<String> n_type;
  Local<String> n_signed;
  Local<String> n_bit_offset;
  Local<String> n_bit_size;
  Local<String> n_byte_size;
  Local<String> n_name;
  Local<String> n_size;
  Local<String> n_members;
  Local<String> n_structure;
  Local<String> n_default_data;
  Local<String> n_default_pointers;
  Local<String> n_expose_data_view;
  Local<String> n_arg_struct;
  Local<String> n_thunk;
  Local<String> n_static_only;

  Local<Object> options;

  JSBridge(Isolate* isolate,
           Local<Object> module,
           ModuleFlags flags) :
    isolate(isolate),
    context(isolate->GetCurrentContext()),
    n_type(String::NewFromUtf8Literal(isolate, "type")),
    n_signed(String::NewFromUtf8Literal(isolate, "signed")),
    n_bit_offset(String::NewFromUtf8Literal(isolate, "bitOffset")),
    n_bit_size(String::NewFromUtf8Literal(isolate, "bitSize")),
    n_byte_size(String::NewFromUtf8Literal(isolate, "byteSize")),
    n_name(String::NewFromUtf8Literal(isolate, "name")),
    n_size(String::NewFromUtf8Literal(isolate, "size")),
    n_members(String::NewFromUtf8Literal(isolate, "members")),
    n_structure(String::NewFromUtf8Literal(isolate, "structure")),
    n_default_data(String::NewFromUtf8Literal(isolate, "defaultData")),
    n_default_pointers(String::NewFromUtf8Literal(isolate, "defaultPointers")),
    n_expose_data_view(String::NewFromUtf8Literal(isolate, "exposeDataView")),
    n_arg_struct(String::NewFromUtf8Literal(isolate, "argStruct")),
    n_thunk(String::NewFromUtf8Literal(isolate, "thunk")),
    n_static_only(String::NewFromUtf8Literal(isolate, "staticOnly")),
    options(Object::New(isolate)) {
    // set options
    Local<Boolean> little_endian = Boolean::New(isolate, flags.little_endian);
    Local<Boolean> runtime_safety = Boolean::New(isolate, flags.runtime_safety);
    options->Set(context, String::NewFromUtf8Literal(isolate, "littleEndian"), little_endian).Check();
    options->Set(context, String::NewFromUtf8Literal(isolate, "realTimeSafety"), runtime_safety).Check();

    // look up functions
    auto find = [&](Local<String> name, Local<Function>* dest) {
      Local<Value> value;
      if (module->Get(context, name).ToLocal<Value>(&value)) {
        if (value->IsFunction()) {
          *dest = value.As<Function>();
        }
      }
    };
    find(String::NewFromUtf8Literal(isolate, "createStructure"), &create_structure);
    find(String::NewFromUtf8Literal(isolate, "shapeStructure"), &shape_structure);
    find(String::NewFromUtf8Literal(isolate, "attachVariables"), &attach_variables);
    find(String::NewFromUtf8Literal(isolate, "attachMethods"), &attach_methods);
  };

  Local<Object> NewMemberRecord(const Member& m) {
    Local<Object> member = Object::New(isolate);
    member->Set(context, n_name, String::NewFromUtf8(isolate, m.name).ToLocalChecked()).Check();
    member->Set(context, n_type, Int32::New(isolate, static_cast<int32_t>(m.type))).Check();
    member->Set(context, n_bit_size, Int32::New(isolate, m.bit_size)).Check();
    member->Set(context, n_bit_offset, Int32::New(isolate, m.bit_offset)).Check();
    member->Set(context, n_byte_size, Int32::New(isolate, m.byte_size)).Check();
    if (m.type == MemberType::Int) {
      member->Set(context, n_signed, Boolean::New(isolate, m.is_signed)).Check();
    }
    return member;
  }

  Local<Object> NewMethodRecord(const Method &m) {
    Local<Function> function;

    Local<Object> def = Object::New(isolate);
    def->Set(context, n_name, String::NewFromUtf8(isolate, m.name).ToLocalChecked()).Check();
    def->Set(context, n_arg_struct, m.structure).Check();
    def->Set(context, n_thunk, function).Check();
    def->Set(context, n_static_only, Boolean::New(isolate, m.is_static_only)).Check();
    return def;   
  }

  Local<Object> NewStructureDefinition(size_t size,
                                       Local<Array> members,
                                       Local<Object> defaultData, 
                                       Local<Object> defaultPointers) {
    Local<Object> def = Object::New(isolate);
    def->Set(context, n_size, Uint32::NewFromUnsigned(isolate, static_cast<uint32_t>(size))).Check();
    def->Set(context, n_members, members).Check();
    if (!defaultData.IsEmpty()) {
      def->Set(context, n_default_data, defaultData).Check();
    }
    if (!defaultPointers.IsEmpty()) {
      def->Set(context, n_default_pointers, defaultPointers).Check();
    }
    return def;
  }
};

//-----------------------------------------------------------------------------
//  Structure used passed stuff to Zig code and back (per call)
//-----------------------------------------------------------------------------
struct Host {
  Isolate* isolate;  
  Local<Context> exec_context;
  Local<Array> mem_pool;
  Local<Object> slots;
  FunctionData* zig_func;
  JSBridge *js_bridge;

  Host(const FunctionCallbackInfo<Value> &info) :
    js_bridge(nullptr) {
    isolate = info.GetIsolate();
    exec_context = isolate->GetCurrentContext();
    if (info.Data()->IsExternal()) {
      zig_func = reinterpret_cast<FunctionData*>(info.Data().As<External>()->Value());
    } else {
      zig_func = nullptr;
    }
  }
};
