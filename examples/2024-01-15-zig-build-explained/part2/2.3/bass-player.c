#include <stdio.h>
#include <stddef.h>
#include <stdbool.h>
#include <bass.h>

int main()
{
  if (BASS_Init(-1, 44100, 0, NULL, NULL) == 0) {
      return 1;
  }

  // Track by Incompetech:
  // "Island Meet and Greet" Kevin MacLeod (incompetech.com)
  // Licensed under Creative Commons: By Attribution 4.0 License
  // http://creativecommons.org/licenses/by/4.0/
  int chan = BASS_StreamCreateURL("https://mq32.de/public/island-meet-and-greet.mp3", 0, BASS_STREAM_BLOCK | BASS_STREAM_AUTOFREE, NULL, NULL);

  BASS_ChannelPlay(chan, FALSE);

  printf("Press ENTER to stop!\n");
  getchar();

  BASS_Free();

  return 0;
}
