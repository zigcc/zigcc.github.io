#include <stdio.h>

void * buffer_create(size_t len);
void buffer_destroy(void * ptr);
void buffer_write(void * buf, size_t offset, void * data, size_t len);
void buffer_read(void * buf, size_t offset, void * data, size_t len);

int main() 
{
  void * buf = buffer_create(8);
  buffer_write(buf, 0, "World", 6);

  {
    char str[8];
    buffer_read(buf, 0, str, 6);
    printf("Hello, %s!\n", str);
  }

  buffer_destroy(buf);

  return 0;
}
