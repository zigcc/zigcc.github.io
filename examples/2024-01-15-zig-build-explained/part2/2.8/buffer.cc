#include <cstring>
#include <cstddef>
#include <algorithm>

extern "C" void * buffer_create(size_t len)
{
  return new char[len];
}

extern "C" void buffer_destroy(void * ptr)
{
  delete[] (char*)ptr;
}

extern "C" void buffer_write(void * buf, size_t offset, void * data, size_t len)
{
  std::copy(
    static_cast<char *>(data),
    static_cast<char *>(data) + len,
    static_cast<char *>(buf) + offset);
}

extern "C" void buffer_read(void * buf, size_t offset, void * data, size_t len)
{
  std::copy(
    static_cast<char *>(buf) + offset,
    static_cast<char *>(buf) + offset + len,
    static_cast<char *>(data));
}
