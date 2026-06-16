const videoId = '4NRXx6U8ABQ';
fetch(`https://pipedapi.kavin.rocks/streams/${videoId}`)
  .then(res => res.json())
  .then(data => {
    const audioStreams = data?.audioStreams || [];
    const best = audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    console.log(best.url ? "Success" : "Failed");
  });
