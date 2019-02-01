//
// (c) 2015 Mark Huckvale University College London
//

// manifest constants
var SRATE = 48000;	// sampling rate (fixed by Audio object)
var FXRATE = 100;   // fundamental frequency rate

// audio
var context = null;
var capturestream = null;
var micsource = null;
var capturenode = null;
var recording = 0;
var paused = 0;
var hscroll = 1;
var ampmod = true;

// graph
var canvas;
var ctx;
var starttime = null;
var anireq;
var BACKCOLOUR = "#FFF";
var GRIDCOLOUR = "#EEE";
var AMPCOLOUR = "aquamarine";
var FXCOLOUR = "steelblue";

// pitch track
var analbuf;
var analpos;
var anallen;

var enmin = 0.5;
var enmax = 0.1;

var fxcalc;
var track = [];
var fxmin = 50;
var fxlow = 50;
var fxhigh = 200;
var fxmax = 400;
var disptime = 5;
var warnOnMin = 180;     // Warn when pitch falls into the boiling hot lava

// utility function
function $(obj) {return document.getElementById(obj);}

// send a message to the console
function trace(message)
{
  console.log(message);
}

function setCookie(name, value)
{
  var date = new Date();
  date.setTime(date.getTime() + (31 * 24 * 60 * 60 * 1000));		// for one month
  var expires = "; expires=" + date.toGMTString();
  document.cookie = name + "=" + value + expires + "; path=/";
}

function getCookie(name, defaultval)
{
  var ca = document.cookie.split(';');
  var nameEQ = name + "=";
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length); //delete spaces
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return defaultval;
}

// get screen size and calculate co-ordinates of screen centre
function screensize()
{
  var e = window, a = 'inner';
  if (!('innerWidth' in window)) {
    a = 'client';
    e = document.documentElement || document.body;
  }
  return {width: e[a + 'Width'], height: e[a + 'Height'], cx: e[a + 'Width'] / 2, cy: e[a + 'Height'] / 2}
}

// start audio processing
function startrecording(stream)
{
  capturestream = stream;

  micsource = context.createMediaStreamSource(stream);

  capturenode = context.createScriptProcessor(2048, 1, 1);

  capturenode.onaudioprocess = function (e)
  {
    if (recording && !paused) {
      var buf = e.inputBuffer.getChannelData(0);
      for (var i = 0; i < buf.length; i++) {
        analbuf[analpos++] = buf[i];
        if (analpos == anallen) {
          fxest = fxcalc.CalculateFx(analbuf, anallen);
          if (fxest.en > 0) {
            if (fxest.en < enmin)
              enmin = fxest.en;
            else
              enmin = (0.99 * enmin + 0.01 * fxest.en);
            if (fxest.en > enmax)
              enmax = fxest.en;
            else
              enmax = (0.99 * enmax + 0.01 * fxest.en);
          }

          if (fxest.en > 0.1 * enmax)
            track.push([fxest.fx, fxest.en / enmax, fxest.vs]);
          else
            track.push([0, 0, 0]);
          // stop after one screen in mode 2
          if ((hscroll == 2) && (track.length >= disptime * FXRATE)) {
            paused = 1;
            window.cancelAnimationFrame(anireq);
            paint(window.performance.now());
          }
          // shift analysis buffer by 10ms
          for (analpos = 0, j = anallen / 5; j < anallen; j++ , analpos++) analbuf[analpos] = analbuf[j];
        }
      }
    }
  };

  // connect microphone to processing node
  micsource.connect(capturenode);
  capturenode.connect(context.destination);

}

// start/stop recording
function doRun()
{

  if (context == null) {
    // create audio context
    try {
      context = new window.AudioContext();
      console.log("context.sampleRate=" + context.sampleRate);
      SRATE = context.sampleRate;
    }
    catch (e) {
      alert('Web Audio API is not supported in this browser. Try Chrome, Firefox or Safari.');
    }
  }

  if (micsource == null) {
    navigator.getMedia = (navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia);

    navigator.getMedia({audio: {optional: [{googNoiseSuppression: false}, {googNoiseSuppression2: false}]}}, startrecording, function () {alert('getUserMedia() failed - use https: address');});
  }

  // start/pause function
  if (recording) {
    recording = 0;
    paused = 0;
    $("runbutton").innerHTML = "Run";
    window.cancelAnimationFrame(anireq);
    closedown();
  }
  else {
    recording = 1;
    paused = 0;
    $("runbutton").innerHTML = "Stop";
    signal = new Array();
    track = new Array();
    anallen = SRATE / 20;
    analpos = 0;
    analbuf = new Array(anallen);
    enmin = 0.001;
    starttime = window.performance.now();
    anireq = window.requestAnimationFrame(paint);
    fxcalc = new fxauto(fxmin, fxlow, fxhigh, fxmax, SRATE);
  }

}
// pause/restart recording
function doPause()
{

  if (recording == 0) return;

  // pause function
  if (paused == 0) {
    paused = 1;
    window.cancelAnimationFrame(anireq);
    paint(window.performance.now());
  }
  else {
    paused = 0;
    anireq = window.requestAnimationFrame(paint);
    if (hscroll == 2) track = new Array();
  }

}


function paint(anitime)
{
  var curtime = track.length / FXRATE;
  var logfxmin = Math.log(fxmin);
  var logfxmax = Math.log(fxmax);

  // clear the context
  ctx.fillStyle = BACKCOLOUR;
  ctx.fillRect(0, 0, ctx.width, ctx.height);

  // clean up the track
  for (var i = track.length - ctx.width, x = 0; i < track.length - 1; i++ , x++) {
    if ((i >= 1) && (track[i][0] > 0)) {
      var f1 = track[i - 1][0];
      var f2 = track[i][0];
      var f3 = track[i + 1][0];
      if ((f1 > 0.45 * f2) && (f1 < 0.55 * f2) && (f3 > 0.45 * f2) && (f3 < 0.55 * f2))
        track[i][0] = f2 / 2;
      else if ((f1 > 1.8 * f2) && (f1 < 2.2 * f2) && (f3 > 1.8 * f2) && (f3 < 2.2 * f2))
        track[i][0] = 2 * f2;
      else if ((f1 < 0.75 * f2) && (f3 < 0.75 * f2))
        track[i][0] = 0;
      else if ((f1 > 1.25 * f2) && (f3 > 1.25 * f2))
        track[i][0] = 0;
    }
  }

  // draw hot lava line
  ctx.strokeStyle = 'tomato';
  ctx.lineWidth = 1;
  ctx.beginPath();
  var y = Math.round(ctx.height - ctx.height * (Math.log(warnOnMin) - logfxmin) / (logfxmax - logfxmin));
  ctx.moveTo(0, y);
  ctx.lineTo(ctx.width, y);
  ctx.stroke();

  // draw frequency grid
  ctx.strokeStyle = GRIDCOLOUR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var f = 50; f <= fxmax; f += 50) {
    var y = Math.round(ctx.height - ctx.height * (Math.log(f) - logfxmin) / (logfxmax - logfxmin));
    ctx.moveTo(0, y);
    ctx.lineTo(ctx.width, y);
  }
  ctx.stroke();

  // draw some frequency labels
  ctx.font = "18px/2 Unknown Font, sans-serif";
  ctx.fillStyle = "#808080";
  for (var f = 0; f <= fxmax; f += 50) {
    var y = Math.round(ctx.height - ctx.height * (Math.log(f) - logfxmin) / (logfxmax - logfxmin));
    ctx.fillText(f, 5, y - 5);
  }

  // report time
  var duration = moment.duration(curtime, 'seconds')
  var days = duration.days()
  var hours = duration.hours() > 0 ? `${duration.hours()}h` : ''
  var minutes = duration.minutes() > 0 ? `${duration.minutes()}m` : ''
  var seconds = duration.seconds() > 0 ? `${duration.seconds()}s` : ''
  var durationFormatted = days < 1 ? `${hours} ${minutes} ${seconds}` : 'Whoa girl. Time to take a break.'
  document.querySelector('.status').innerText = durationFormatted;


  // draw graph
  if (ampmod) {
    ctx.strokeStyle = AMPCOLOUR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    var offset = track.length - Math.round(disptime * FXRATE);
    for (var i = offset; i < track.length - 1; i++) {
      if ((i >= 0) && (track[i][0] > 0)) {
        var x1 = (i - offset) * ctx.width / (disptime * FXRATE);
        var x2 = (i + 1 - offset) * ctx.width / (disptime * FXRATE);
        if (hscroll == 0) {
          x1 = (i * ctx.width / (disptime * FXRATE)) % ctx.width;
          x2 = x1 + ctx.width / (disptime * FXRATE);
        }
        else if (hscroll == 2) {
          x1 = (i * ctx.width / (disptime * FXRATE));
          x2 = x1 + ctx.width / (disptime * FXRATE);
        }
        var pitch = track[i][0]
        var maybeAmplitude = track[i][1]

        const signalExists = maybeAmplitude > 0.5;
        if (pitch < warnOnMin && signalExists) {
          document.body.setAttribute('class', 'warn')
        } else {
          document.body.setAttribute('class', 'okay')
        }
        var y1 = ctx.height * (Math.log(track[i][0]) - logfxmin) / (logfxmax - logfxmin);
        var y2 = ctx.height * (Math.log(track[i + 1][0]) - logfxmin) / (logfxmax - logfxmin);
        var w1 = ctx.height * track[i][1] / 10;
        var w2 = ctx.height * track[i + 1][1] / 10;
        var change = Math.abs(2 * (track[i][0] - track[i + 1][0]) / (track[i][0] + track[i + 1][0]));
        if ((track[i + 1][0] > 0) && (change < 0.2)) {
          for (x = x1; x <= x2; x++) {
            var m = (x - x1) / (x2 - x1);
            ctx.moveTo(x, ctx.height - ((1 - m) * y1 + m * y2) + ((1 - m) * w1 + m * w2) / 2);
            ctx.lineTo(x, ctx.height - ((1 - m) * y1 + m * y2) - ((1 - m) * w1 + m * w2) / 2);
          }
        }
        else {
          ctx.moveTo(x1, ctx.height - y1 + w1 / 2);
          ctx.lineTo(x1, ctx.height - y1 - w1 / 2);
        }
      }
    }
    ctx.stroke();
  }

  if (ampmod) {
    ctx.strokeStyle = FXCOLOUR;
    ctx.lineWidth = 2;
  }
  else {
    ctx.strokeStyle = AMPCOLOUR;
    ctx.lineWidth = 3;
  }
  ctx.beginPath();
  var offset = track.length - Math.round(disptime * FXRATE);
  for (var i = offset; i < track.length - 1; i++) {
    if ((i >= 0) && (track[i][0] > 0)) {
      var x1 = (i - offset) * ctx.width / (disptime * FXRATE);
      var x2 = (i + 1 - offset) * ctx.width / (disptime * FXRATE);
      if (hscroll == 0) {
        x1 = (i * ctx.width / (disptime * FXRATE)) % ctx.width;
        x2 = x1 + ctx.width / (disptime * FXRATE);
      }
      else if (hscroll == 2) {
        x1 = (i * ctx.width / (disptime * FXRATE));
        x2 = x1 + ctx.width / (disptime * FXRATE);
      }
      var y1 = ctx.height * (Math.log(track[i][0]) - logfxmin) / (logfxmax - logfxmin);
      var y2 = ctx.height * (Math.log(track[i + 1][0]) - logfxmin) / (logfxmax - logfxmin);
      var change = Math.abs(2 * (track[i][0] - track[i + 1][0]) / (track[i][0] + track[i + 1][0]));
      if ((track[i + 1][0] > 0) && (change < 0.2)) {
        ctx.moveTo(x1, ctx.height - y1);
        ctx.lineTo(x2, ctx.height - y2);
      }
      else {
        ctx.moveTo(x1, ctx.height - y1 - 1);
        ctx.lineTo(x1, ctx.height - y1 + 1);
      }
    }
  }
  ctx.stroke();

  // stack up next call
  if (recording && !paused) anireq = window.requestAnimationFrame(paint);

}

// standard fx settings
function onsetfx(target)
{
  switch (target) {
    case 1:
      $('fxmin').value = 50;
      $('fxlow').value = 100;
      $('fxhigh').value = 200;
      $('fxmax').value = 300;
      break;
    case 2:
      $('fxmin').value = 75;
      $('fxlow').value = 150;
      $('fxhigh').value = 300;
      $('fxmax').value = 450;
      break;
    case 3:
      $('fxmin').value = 100;
      $('fxlow').value = 200;
      $('fxhigh').value = 400;
      $('fxmax').value = 600;
      break;
  }
}

// close configuration
function onconfigdlg()
{
  $('mask').style.visibility = 'hidden';
  $('configdlg').style.visibility = 'hidden';
  fxmin = $('fxmin').value;
  fxlow = $('fxlow').value;
  fxhigh = $('fxhigh').value;
  fxmax = $('fxmax').value;
  disptime = $('disptime').value;
  if ($('scroll1').checked)
    hscroll = 1;
  else if (hscroll = $('scroll2').checked)
    hscroll = 2;
  else
    hscroll = 0;
  ampmod = $('amplitude1').checked;
  warnOnMin = $('warnOnMin').value;
  setCookie("fxmin", fxmin);
  setCookie("fxlow", fxlow);
  setCookie("fxhigh", fxhigh);
  setCookie("fxmax", fxmax);
  setCookie("disptime", disptime);
  setCookie("hscroll", hscroll);
  setCookie("ampmod", ampmod);
  setCookie("warnOnMin", warnOnMin);
  paint(window.performance.now());
}

// configure
function doConfig()
{
  $('mask').style.visibility = 'visible';
  var dlg = $('configdlg');
  dlg.style.top = screensize().cy - dlg.offsetHeight / 2;
  dlg.style.left = screensize().cx - dlg.offsetWidth / 2;
  dlg.style.visibility = 'visible';
  $('fxmin').value = fxmin;
  $('fxlow').value = fxlow;
  $('fxhigh').value = fxhigh;
  $('fxmax').value = fxmax;
  $('disptime').value = disptime;
  $('scroll0').checked = (hscroll == 0);
  $('scroll1').checked = (hscroll == 1);
  $('scroll2').checked = (hscroll == 2);
  $('amplitude1').checked = ampmod;
  $('amplitude0').checked = !ampmod;
  $('warnOnMin').value = warnOnMin;
}

// help
function doHelp()
{
  window.open("help.html", "_blank", "");
}

// about
function doAbout()
{
  $('mask').style.visibility = 'visible';
  var dlg = $('aboutdlg');
  dlg.style.top = screensize().cy - dlg.offsetHeight / 2;
  dlg.style.left = screensize().cx - dlg.offsetWidth / 2;
  dlg.style.visibility = 'visible';
}

// dialog cancel button handler
function cancel(dlg)
{
  $('mask').style.visibility = 'hidden';
  $(dlg).style.visibility = 'hidden';
}

function dokey(event)
{
  var keyCode = ('which' in event) ? event.which : event.keyCode;
  if (keyCode == 32) {
    // space bar
    if (!recording)
      doRun();
    else
      doPause();
  }
}

// set sizes of graphs to fit screen
function doresize()
{
  // main div
  var mwidth = screensize().width - 2;
  var mheight = screensize().height - 95;
  $("main").style.width = mwidth + "px";
  $("main").style.height = mheight + "px";

  canvas = $("cnv");
  canvas.style.width = (mwidth - 10) + "px";
  canvas.style.height = (mheight - 10) + "px";
  canvas.width = mwidth - 10;
  canvas.height = mheight - 10;
  if (canvas.getContext) {
    ctx = canvas.getContext("2d");
    ctx.width = canvas.width;
    ctx.height = canvas.height;
  }

  paint(window.performance.now());
}

// initialise whole page
function initialise()
{
  // restore  last used configuration
  fxmin = getCookie("fxmin", 50);
  fxlow = getCookie("fxlow", 50);
  fxhigh = getCookie("fxhigh", 200);
  fxmax = getCookie("fxmax", 400);
  disptime = getCookie("disptime", 5);
  hscroll = getCookie("hscroll", 1);
  ampmod = (getCookie("ampmod", "true") == "true");
  warnOnMin = getCookie('warnOnMin', 180);

  // set sizes and draw
  doresize();

}

// closedown
function closedown()
{
  if (micsource != null) micsource.disconnect(capturenode);
  micsource = null;
  if (capturenode != null) capturenode.disconnect(context.destination);
  capturenode = null;
  if (capturestream != null) {
    var tracks = capturestream.getAudioTracks();
    console.log("Found " + tracks.length + " audio tracks to close");
    for (var i = 0; i < tracks.length; i++) {
      tracks[i].stop();
      capturestream.removeTrack(tracks[i]);
    }
    capturestream = null;
  }
}