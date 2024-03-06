#include <windows.h>
#include <string.h>

void printText(char const * str)
{
  HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);

  DWORD bytes_written;
  WriteFile(h, str, strlen(str), &bytes_written, NULL);
}
