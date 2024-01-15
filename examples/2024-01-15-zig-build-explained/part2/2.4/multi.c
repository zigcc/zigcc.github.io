#include <stdio.h>
#include <api.h>

#define S(X) #X
#define SS(X) S(X)

void API_NAME()
{
  printf(SS(API_NAME) "\n");
}
