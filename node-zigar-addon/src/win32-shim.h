#ifndef _WIN32_SHIM_H_
#define _WIN32_SHIM_H_
#include <stdbool.h>

#define RTLD_LAZY   0
#define RTLD_NOW    0

typedef struct {
    const char *dli_fname;
    void       *dli_fbase;
    const char *dli_sname;
    void       *dli_saddr;
} Dl_info;

inline void* dlopen(const char* filename,
                    int flags) {
    return (void*) LoadLibraryA(filename);
}

inline void* dlsym(void* handle,
                   const char* symbol) {
    return GetProcAddress((HMODULE) handle, symbol);
}

inline int dlclose(void* handle) {
    return FreeLibrary((HMODULE) handle) ? 0 : 1;
}

inline int dladdr(const void *addr, Dl_info *info) {
    MEMORY_BASIC_INFORMATION info;
    if (VirtualQuery(addr, &info, sizeof(info)) != sizeof(info)) {
        return 0;
    }
    info->dli_fname = NULL;
    info->dli_fbase = info.AllocationBase;
    info->dli_sname = NULL;
    info->dli_saddr = addr;
    return 1;
}

typedef int (*override_callback)(const void*, size_t);

void patch_write_file(void* handle,
                      override_callback cb);

#endif