#include <unistd.h>
#include <string.h>

void printText(char const * str)
{
  write(STDOUT_FILENO, str, strlen(str));
}
