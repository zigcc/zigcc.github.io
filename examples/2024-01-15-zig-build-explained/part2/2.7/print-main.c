#include <stdio.h>

#ifdef USE_PLATFORM_IO
extern void printText(char const * str);
#else
void printText(char const * str)
{
  fputs(str, stdout);
}
#endif

int main()
{
  printText("Hello, cross platform code!\n");
  return 0;
}