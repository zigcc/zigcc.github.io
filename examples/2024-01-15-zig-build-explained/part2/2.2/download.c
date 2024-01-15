#include <stdio.h>
#include <curl/curl.h>

static size_t writeData(void *ptr, size_t size, size_t nmemb, FILE *stream) {
    size_t written;
    written = fwrite(ptr, size, nmemb, stream);
    return written;
}

int main(int argc, char ** argv) 
{
  if(argc != 2)
    return 1;
  
  char const * url = argv[1];
  CURL * curl = curl_easy_init();
  if (curl == NULL)
    return 1;
      
  curl_easy_setopt(curl, CURLOPT_URL, url);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeData);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, stdout);
  CURLcode res = curl_easy_perform(curl);
  curl_easy_cleanup(curl);
  
  if(res != CURLE_OK)
    return 1;

  return 0;
}
