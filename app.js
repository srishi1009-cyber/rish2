// Register Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}

// State Management
let songs = [];
let currentIndex = -1;
let isSeeking = false;

// Daily played tracking to prevent daily repeats
const TODAY_KEY = "played_" + new Date().toISOString().slice(0, 10);
let playedToday = JSON.parse(localStorage.getItem(TODAY_KEY) || "[]");

// Clean previous dates' keys to save storage
Object.keys(localStorage).forEach((key) => {
  if (key.startsWith("played_") && key !== TODAY_KEY) {
    localStorage.removeItem(key);
  }
});

// DOM Elements
const audio = document.getElementById("audio-element");
const fileInput = document.getElementById("file-input");
const songListEl = document.getElementById("song-list");
const emptyStateEl = document.getElementById("empty-state");
const playBtn = document.getElementById("play-btn");
const playIcon = document.getElementById("play-icon");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const seekBar = document.getElementById("seek-bar");
const currentTimeEl = document.getElementById("current-time");
const durationEl = document.getElementById("duration");
const nowPlayingTitle = document.getElementById("now-playing-title");
const nowPlayingSub = document.getElementById("now-playing-sub");
const searchInput = document.getElementById("search-input");
const categoryFilter = document.getElementById("category-filter");

// Local File Import Handler
fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  files.forEach((file) => {
    const songId = `${file.name}_${file.size}`;
    if (!songs.some((s) => s.id === songId)) {
      const url = URL.createObjectURL(file);
      songs.push({
        id: songId,
        name: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Local Track",
        url: url
      });
    }
  });

  renderSongList();

  // If first time importing and idle, automatically play the first available track
  if (currentIndex === -1 && songs.length > 0) {
    playNextValidTrack(false);
  }
});

// Render UI List with search filter
function renderSongList() {
  const filterQuery = searchInput.value.toLowerCase();
  songListEl.innerHTML = "";

  const filtered = songs.filter((s) => s.name.toLowerCase().includes(filterQuery));

  if (filtered.length === 0) {
    emptyStateEl.style.display = "block";
    emptyStateEl.textContent = songs.length === 0 ? "No tracks imported yet. Tap \"+ Import Track\" to add songs." : "No songs found.";
    songListEl.appendChild(emptyStateEl);
    return;
  }

  emptyStateEl.style.display = "none";

  filtered.forEach((track) => {
    const originalIndex = songs.findIndex((s) => s.id === track.id);
    const item = document.createElement("div");
    item.className = `song-item ${originalIndex === currentIndex ? "active" : ""}`;
    item.innerHTML = `
      <div class="song-details">
        <div class="song-name">${track.name}</div>
        <div class="song-artist">${track.artist}</div>
      </div>
      <i class="fa-solid ${originalIndex === currentIndex && !audio.paused ? "fa-volume-high" : "fa-music"}" style="color: #0077ff; font-size: 0.85rem;"></i>
    `;
    item.addEventListener("click", () => {
      // Manual click overrides the daily restriction
      playTrack(originalIndex, true);
    });
    songListEl.appendChild(item);
  });
}

// Play specified song
function playTrack(index, isManual = false) {
  if (index < 0 || index >= songs.length) return;
  currentIndex = index;
  const track = songs[currentIndex];

  audio.src = track.url;
  audio.load();

  // Auto-play prevention safe invocation
  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      // Handles mobile auto-play policy delays without getting stuck
      playIcon.className = "fa-solid fa-play";
    });
  }

  nowPlayingTitle.textContent = track.name;
  nowPlayingSub.textContent = track.artist;

  // Record daily playback
  if (!playedToday.includes(track.id)) {
    playedToday.push(track.id);
    localStorage.setItem(TODAY_KEY, JSON.stringify(playedToday));
  }

  renderSongList();
}

// Pick next track preventing duplicate plays in the same day unless all songs are exhausted
function playNextValidTrack(isBackward = false) {
  if (songs.length === 0) return;

  let unplayedIndices = [];
  songs.forEach((s, idx) => {
    if (!playedToday.includes(s.id)) {
      unplayedIndices.push(idx);
    }
  });

  // Reset daily cycle if all tracks have been played today
  if (unplayedIndices.length === 0) {
    playedToday = [];
    localStorage.removeItem(TODAY_KEY);
    unplayedIndices = songs.map((_, idx) => idx);
  }

  let nextIdx;
  if (!isBackward) {
    // Look forward for an unplayed index
    const forwardCandidate = unplayedIndices.find((idx) => idx > currentIndex);
    nextIdx = forwardCandidate !== undefined ? forwardCandidate : unplayedIndices[0];
  } else {
    // Look backward for an unplayed index
    const backwardCandidate = [...unplayedIndices].reverse().find((idx) => idx < currentIndex);
    nextIdx = backwardCandidate !== undefined ? backwardCandidate : unplayedIndices[unplayedIndices.length - 1];
  }

  playTrack(nextIdx, false);
}

// Button controls
playBtn.addEventListener("click", () => {
  if (songs.length === 0) return;
  if (currentIndex === -1) {
    playNextValidTrack(false);
    return;
  }
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
});

nextBtn.addEventListener("click", () => playNextValidTrack(false));
prevBtn.addEventListener("click", () => playNextValidTrack(true));

// Auto transition without getting stuck
audio.addEventListener("ended", () => {
  playNextValidTrack(false);
});

audio.addEventListener("error", () => {
  // If a track fails, automatically skip to prevent getting stuck
  playNextValidTrack(false);
});

// Sync Playback state with UI icons
audio.addEventListener("play", () => {
  playIcon.className = "fa-solid fa-pause";
  renderSongList();
});

audio.addEventListener("pause", () => {
  playIcon.className = "fa-solid fa-play";
  renderSongList();
});

// Update Scrubber Progress
audio.addEventListener("timeupdate", () => {
  if (!isSeeking && audio.duration) {
    const percent = (audio.currentTime / audio.duration) * 100;
    seekBar.value = percent;
    currentTimeEl.textContent = formatTime(audio.currentTime);
  }
});

audio.addEventListener("loadedmetadata", () => {
  durationEl.textContent = formatTime(audio.duration);
});

// Seeking Controls
seekBar.addEventListener("input", () => {
  isSeeking = true;
});

seekBar.addEventListener("change", () => {
  if (audio.duration) {
    audio.currentTime = (seekBar.value / 100) * audio.duration;
  }
  isSeeking = false;
});

// Helpers
function formatTime(secs) {
  if (isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// Search real-time listener
searchInput.addEventListener("input", renderSongList);