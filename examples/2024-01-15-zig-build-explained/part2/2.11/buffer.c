#include <stdlib.h>
#include <string.h>

void * buffer_create(size_t len)
{
  return malloc(len);
}

void buffer_destroy(void * ptr)
{
  free(ptr);
}

void buffer_write(void * buf, size_t offset, void * data, size_t len)
{
  memcpy(
    (char*)buf + offset,
    data,
    len);
}

void buffer_read(void * buf, size_t offset, void * data, size_t len)
{
  memcpy(
    data,
    (char*)buf + offset,
    len);
}
