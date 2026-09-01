// ============================================================
// ALM31 Assistant — Backend Server (WITH IMAGE + VIDEO MATCHING)
// Google Gemini — Current @google/genai SDK
// ============================================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

// Accepts either GEMINI_API_KEY or GOOGLE_API_KEY from your .env file
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!API_KEY) {
    console.error("ERROR: No API key found. Set GEMINI_API_KEY (or GOOGLE_API_KEY) in your .env file");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: API_KEY
});

const MODEL_NAME = "gemini-3.1-flash-lite";

// ============================================================
// VIDEO MATCHING
// ============================================================
// NOTE: peak current (positive peak, negative peak, crest factor) is a
// WAVEFORM MODE concept — the peak-to-RMS ratio within a single cycle.
// This is different from Trend Mode's MIN-AVG-MAX, which tracks the
// min/mean/max of the RMS value across many readings over a longer time
// window. Keywords below are scoped to Waveform Mode phrasing only, so
// this video does not fire for "maximum current over 5 days" type
// Trend Mode questions — those should continue to match the
// arms_n_with_min_avg_max.png / arms_n_without_min_avg_max.png images
// via IMAGE_MAP instead.
const VIDEO_MAP = [
    {
        file: "videos/peak-current.mp4",
        keywords: [
            "peak current", "see peak current", "view peak current", "how to see peak current",
            "positive peak current", "negative peak current", "positive peak", "negative peak",
            "max peak current", "min peak current", "maximum peak current", "minimum peak current",
            "current crest factor", "current peak factor", "4A CF", "waveform peak current"
        ]
    },
    {
        file: "videos/RMS_VALUES_CREST_FACTOR_MAX_AND_MIN_RMS_PEAK_FACTOR_PHASOR_DIAGRAM_PEAK_VALUES_K-FACTOR_PST_SHORT-TERM-FLICKER_.mp4",
        keywords: [
            "RMS values", "RMS voltage", "RMS current", "root mean square",
            "crest factor", "peak to RMS", "peak factor", "CF",
            "max and min RMS", "maximum RMS", "minimum RMS", "averaging",
            "phasor diagram", "phasor", "fresnel diagram", "vector diagram",
            "peak values", "positive peak", "negative peak",
            "K-factor", "K factor", "transformer heating", "harmonic loss",
            "PST", "short-term flicker", "flicker", "voltage flicker"
        ]
    },
    {
        file: "videos/INDUVIDUAL_HARMONICS_.mp4",
        keywords: [
            "harmonics", "individual harmonics", "harmonic analysis", "harmonic distortion",
            "harmonic content", "harmonic measurement", "harmonic voltage", "harmonic current",
            "THD", "total harmonic distortion", "harmonic order", "fundamental harmonic"
        ]
    },
    {
        file: "videos/power-values.mp4",
        keywords: [
            "power values", "power factor", "power factor values", "power measurement",
            "active power", "reactive power", "apparent power", "distortion power",
            "energy", "energy consumption", "energy meter", "power quality",
            "cos phi", "tan phi", "displacement factor", "energies consumed", "energies generated",
            "energy count", "energy counting", "energy total", "total energy", "energy display",
            "wh", "varh", "vah", "energy metering", "energy readings"
        ]
    },
    {
    file: "videos/TREND-RECORDING_.mp4",
    keywords: [
        "trend mode", "trend recording", "recording schedule", "memory usage",
        "trend mode screen", "recording list", "recording parameters", "recording display",
        "display recordings", "trend data", "trending", "record trend",
        "configure trend", "trend period", "recording period", "trend window",
        "data logging", "continuous recording", "trending data", "trend analysis"
    ]
}
];
// Normalizes text for matching: lowercases and replaces any run of
// non-alphanumeric characters (periods, hyphens, slashes, etc.) with a
// single space. This means "MAX.-MIN.", "Max-Min", and "max min" all
// normalize to the same "max min" and match reliably.
function normalizeForMatch(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Scores a normalized keyword by SPECIFICITY, not raw character length.
// Word count dominates: a 2-word technical match like "4a rms" always beats
// a 1-word generic match like "display", even though "display" has more
// characters. Character length only breaks ties between equally-specific
// (same word count) keywords.
function specificityScore(keywordNormalized) {
  const wordCount = keywordNormalized.split(" ").filter(Boolean).length;
  return wordCount * 1000 + keywordNormalized.length;
}

// Word-based matching: every word in the keyword must appear as a whole
// word somewhere in the question, regardless of order or what sits
// between them. This fixes the old bug where a keyword like "Vms with"
// failed to match "Vrms (3L) with MIN-AVG-MAX" just because "(3L)" sat
// between the quantity name and "with", breaking the old contiguous
// substring match.
function keywordMatches(questionNormalized, keywordNormalized) {
  const qWords = ` ${questionNormalized} `;
  const kWords = keywordNormalized.split(" ").filter(Boolean);
  return kWords.every(w => qWords.includes(` ${w} `));
}

function findMatchingVideo(customerQuestion, aiAnswer) {
  const questionNormalized = normalizeForMatch(customerQuestion);
  let bestTopic = null;
  let bestScore = -1;

  for (const topic of VIDEO_MAP) {
    for (const keyword of topic.keywords) {
      const keywordNormalized = normalizeForMatch(keyword);
      if (keywordMatches(questionNormalized, keywordNormalized)) {
        const score = specificityScore(keywordNormalized);
        if (score > bestScore) {
          bestScore = score;
          bestTopic = topic;
        }
      }
    }
  }

  return bestTopic ? "/" + encodeURI(bestTopic.file) : null;
}

const IMAGE_MAP = [
  {
    file: "images/alm31-device.png",
    keywords: ["what does the device look like", "device overview photo", "power analyzer photo", "ALM31 device picture"]
  },
  {
    file: "images/getting-started-unpacking.png",
    keywords: ["unpacking", "box", "comes with", "what's included", "included in the box", "accessories", "cable", "battery", "carrying bag"]
  },
  {
    file: "images/getting-started-charging.png",
    keywords: ["charge", "charging", "battery charge", "battery", "first use", "power supply", "charge battery", "full charge", "charging time"]
  },
  {
    file: "images/getting-started-language.png",
    keywords: ["language", "choice of language", "first language", "turn on", "power on", "green button", "display language", "language selection"]
  },
  {
    file: "images/installation-leads-terminals.png",
    keywords: ["install leads", "terminals", "connection", "leads", "colored rings", "inserts", "clip", "connect leads", "installation"]
  },
  {
    file: "images/overall-view.png",
    keywords: ["overall view", "device layout", "display", "keypad", "terminals", "connectors", "device overview", "components"]
  },
  {
    file: "images/on-off-switch.png",
    keywords: ["on/off switch", "power", "battery", "turn on", "turn off", "mains power", "power button", "switch"]
  },
  {
    file: "images/display-presentation.png",
    keywords: ["display presentation", "screen", "information", "indicators", "battery charge", "display info", "battery level", "frequency"]
  },
  {
    file: "images/connection-terminals.png",
    keywords: ["connectors", "connection terminals", "terminals", "connection", "USB", "power connector", "current terminals", "voltage terminals"]
  },
  {
    file: "images/config-date-time.png",
    keywords: ["date", "time", "set date", "set time", "date/time", "24-hour", "12-hour", "clock", "configure date", "configure time"]
  },
  {
    file: "images/config-display.png",
    keywords: ["brightness", "screen shutdown", "display settings", "brightness settings", "configure display"]
  },
  {
    file: "images/config-night-mode.png",
    keywords: ["night mode", "dark mode", "eye comfort", "night display"]
  },
  {
    file: "images/config-calculation-methods.png",
    keywords: ["calculation methods", "non-active quantities", "k factor", "harmonic reference", "calculation"]
  },
  {
    // FIXED: file on disk is "config- colours-of-the-voltage-and-current-curves.png"
    // (note the stray space and "-curves" suffix). Rename the actual file to
    // remove the space (spaces in filenames cause URL-encoding issues), e.g.
    // "config-colours-of-the-voltage-and-current-curves.png", then this entry
    // will resolve correctly. Until you rename the file, this will 404.
    file: "images/config-colours-of-the-voltage-and-current-curves.png",
    keywords: ["color", "colour", "voltage", "current", "curve", "measurement line", "colors", "colours"]
  },
  {
    file: "images/config-erase-memory.png",
    keywords: ["erase memory", "erase", "delete", "memory", "clear data", "delete data"]
  },
  {
    file: "images/config-about.png",
    keywords: ["about", "device information", "software version", "serial number"]
  },
  {
    file: "images/transient-detection-schedule.png",
    keywords: ["detection schedule", "programming", "transient", "start search", "program search", "detection", "program transient", "search schedule"]
  },
  {
    file: "images/transient-list-of-searches.png",
    keywords: ["list of searches", "transient search", "display search", "search list", "transient list", "searches", "search display"]
  },
  {
    file: "images/transient-list-screen.png",
    keywords: ["transient list", "transient screen", "transient number", "triggering channel", "transient display", "transient info"]
  },
  {
    file: "images/transient-display-curves.png",
    keywords: ["display curves", "transient curves", "waveform", "transient waveform", "transient data", "curves", "waveform display", "transient view"]
  },
  {
    file: "images/config-harmonic-3l-phase-neutral.png",
    keywords: ["phase-to-neutral", "voltage harmonic", "3L voltage", "phase-neutral voltage", "3L phase neutral", "harmonic voltage"]
  },
  {
    file: "images/config-harmonic-l1-phase-voltage.png",
    keywords: ["L1 phase", "voltage harmonic", "phase voltage", "L1 voltage", "phase-neutral", "L1 harmonic"]
  },
  {
    file: "images/config-harmonic-3l-current.png",
    keywords: ["current harmonic", "3L current", "harmonic current", "current harmonics", "3 phase current", "current display"]
  },
  {
    file: "images/config-harmonic-l1-current.png",
    keywords: ["L1 current", "current harmonic", "phase current", "L1 phase current", "L1 harmonic current"]
  },
  {
    file: "images/config-harmonic-3l-apparent-power.png",
    keywords: ["apparent power", "harmonic power", "3L apparent", "power harmonic", "apparent power harmonic", "power display"]
  },
  {
    file: "images/config-harmonic-l1-apparent-power.png",
    keywords: ["L1 apparent", "power harmonic", "apparent power", "L1 power", "phase apparent power"]
  },
  {
    file: "images/config-harmonic-3l-phase-phase.png",
    keywords: ["phase-to-phase", "voltage harmonic", "phase-phase voltage", "3L phase-to-phase", "line voltage harmonic", "phase voltage"]
  },
  {
    file: "images/config-harmonic-l1-phase-phase.png",
    keywords: ["L1 phase-to-phase", "voltage", "phase-to-phase", "line voltage", "L1 line voltage"]
  },
  {
    file: "images/config-harmonic-expert-voltage.png",
    keywords: ["expert mode", "negative sequence", "zero sequence", "positive sequence", "expert voltage", "sequence analysis", "harmonic sequence"]
  },
  {
    file: "images/config-harmonic-expert-current.png",
    keywords: ["expert mode current", "sequence", "current sequence", "negative sequence", "zero sequence", "expert current"]
  },
  {
    // MISSING FILE: "images/waveform-overview.png" does not exist in public/images.
    // Any question matching these keywords will currently 404 on the image.
    // Add the file, or remove/repoint this entry until you do.
    file: "images/waveform-overview.png",
    keywords: ["waveform mode", "waveform screen", "current and voltage curves", "peak", "peak value"]
  },
  {
    file: "images/waveform-3u-rms.png",
    keywords: ["3U RMS", "phase-to-phase voltage waveform", "3U display screen"]
  },
  {
    file: "images/waveform-3v-rms.png",
    keywords: ["3V RMS", "phase-to-neutral voltage waveform", "3V display screen"]
  },
  {
    file: "images/waveform-4a-rms.png",
    keywords: ["4A RMS", "current waveform", "4A display screen"]
  },
  {
    file: "images/waveform-l1-rms.png",
    keywords: ["L1 RMS", "phase 1 waveform", "RMS display screen for L1"]
  },
  {
    file: "images/waveform-3u-thd.png",
    keywords: ["3U THD", "3U total harmonic distortion"]
  },
  {
    file: "images/waveform-3v-thd.png",
    keywords: ["3V THD", "3V total harmonic distortion"]
  },
  {
    file: "images/waveform-4a-thd.png",
    keywords: ["4A THD", "4A total harmonic distortion"]
  },
  {
    file: "images/waveform-3u-cf.png",
    keywords: ["3U CF", "3U peak factor", "3U crest factor"]
  },
  {
    file: "images/waveform-3v-cf.png",
    keywords: ["3V CF", "3V peak factor", "3V crest factor"]
  },
  {
    file: "images/waveform-4a-cf.png",
    // Note: generic "peak current" phrasing now lives primarily on the
    // VIDEO_MAP entry above. Kept here too so the image still appears
    // alongside the video for these questions (both are shown to the
    // customer — see displayResponse in the frontend).
    keywords: ["4A CF", "4A peak factor", "4A crest factor", "peak current", "current crest factor", "current peak factor"]
  },
  {
    file: "images/waveform-3u-maxmin.png",
    keywords: ["3U max min", "3U extreme voltage"]
  },
  {
    file: "images/waveform-3v-maxmin.png",
    keywords: ["3V max min", "3V extreme voltage"]
  },
  {
    file: "images/waveform-4a-maxmin.png",
    keywords: ["4A max min", "4A extreme current", "maximum current", "highest current"]
  },
  {
    file: "images/waveform-l1-maxmin.png",
    keywords: ["L1 max min", "L1 extreme voltage current"]
  },
  {
    file: "images/waveform-3u-simultaneous.png",
    keywords: ["3U simultaneous", "3U RMS DC THD CF"]
  },
  {
    file: "images/waveform-3v-simultaneous.png",
    keywords: ["3V simultaneous", "3V RMS DC THD CF PST"]
  },
  {
    file: "images/waveform-4a-simultaneous.png",
    keywords: ["4A simultaneous", "4A RMS DC THD CF FHL FK"]
  },
  {
    file: "images/waveform-l1-simultaneous.png",
    keywords: ["L1 simultaneous", "L1 RMS DC THD CF PST FHL FK"]
  },
  {
    file: "images/waveform-3v-fresnel.png",
    keywords: ["3V fresnel", "3V Fresnel diagram", "vector diagram voltage"]
  },
  {
    file: "images/waveform-l1-fresnel.png",
    keywords: ["L1 fresnel", "fresnel diagram phase 1"]
  },
  {
    // MISSING FILE: "images/alarm-mode-screen.png" does not exist in public/images.
    file: "images/alarm-mode-screen.png",
    keywords: ["alarm mode", "alarm campaign", "alarm thresholds", "program alarm", "detection schedule alarm", "alarm parameters"]
  },
  {
    file: "images/alarm-list-of-campaigns.png",
    keywords: ["list of campaigns", "alarm campaigns list", "campaigns performed", "display campaigns"]
  },
  {
    file: "images/alarm-list-screen.png",
    keywords: ["list of alarms", "alarm list screen", "alarms detected", "alarm duration", "alarm date and time"]
  },

  // ============ TREND MODE IMAGES ============
  {
    // FIXED: was "images/trend_mode_screen.png" (did not exist).
    // Actual file on disk is "images/config-trend-mode.png".
    file: "images/config-trend-mode.png",
    keywords: ["trend mode", "trend recording", "recording schedule", "memory usage", "trend mode screen"]
  },
  {
    file: "images/recording_list_display.png",
    keywords: ["recording list", "list of recordings", "recording date", "recording time", "display recordings"]
  },
  {
    file: "images/recording_parameters_display.png",
    keywords: ["recording parameters", "recording characteristics", "name start stop period", "measurement tabs"]
  },
  {
    file: "images/vms_ql_without_min_avg_max.png",
    keywords: ["voltage without min avg max", "Vms without", "vrms without", "voltage curve basic", "voltage RMS display"]
  },
  {
    file: "images/vms_ql_with_min_avg_max.png",
    keywords: ["voltage with min avg max", "Vms with", "vrms with", "voltage curve precise", "voltage averaging"]
  },
  {
    file: "images/arms_n_without_min_avg_max.png",
    keywords: ["current without min avg max", "Arms without", "current curve basic", "current RMS display"]
  },
  {
    file: "images/arms_n_with_min_avg_max.png",
    // Trend Mode's own "max current over time" phrasing — distinct from
    // Waveform Mode's instantaneous peak/crest factor (see 4A CF above
    // and the VIDEO_MAP note).
    keywords: ["current with min avg max", "Arms with", "current min mean max", "three curves current", "current averaging", "maximum current over time", "highest recorded current"]
  },
  {
    file: "images/vms_l1_without_min_avg_max.png",
    keywords: ["phase L1 voltage without", "L1 voltage basic", "vrms l1 without", "phase voltage display"]
  },
  {
    file: "images/vms_l1_with_min_avg_max.png",
    keywords: ["phase L1 voltage with", "L1 voltage precise", "vrms l1 with", "phase L1 averaging"]
  },
  {
    file: "images/tan_phi_l1_without_min_avg_max.png",
    keywords: ["displacement angle without", "tan phi without", "phase displacement basic"]
  },
  {
    // MISSING FILE: only "tan_phi_l1_without_min_avg_max.png" exists on disk.
    // "tan_phi_l1_with_min_avg_max.png" is not present yet.
    file: "images/tan_phi_l1_with_min_avg_max.png",
    keywords: ["displacement angle with", "tan phi with", "phase displacement precise"]
  },
  {
    // MISSING FILE: only "p_total_with_min_avg_max.png" exists on disk.
    // "p_total_without_min_avg_max.png" is not present yet.
    file: "images/p_total_without_min_avg_max.png",
    keywords: ["power without min avg max", "total power basic", "real power display", "power curve"]
  },
  {
    file: "images/p_total_with_min_avg_max.png",
    keywords: ["power with min avg max", "total power precise", "power averaging", "power min mean max"]
  },
  {
    file: "images/ph_energy_without_min_avg_max.png",
    keywords: ["energy without", "apparent energy basic", "energy bar chart"]
  },
  {
    // MISSING FILE: only "ph_energy_without_min_avg_max.png" exists on disk.
    // "ph_energy_with_min_avg_max.png" is not present yet.
    file: "images/ph_energy_with_min_avg_max.png",
    keywords: ["energy with", "apparent energy precise", "energy averaging"]
  },
  {
    // MISSING FILE: only "cos_phi_l1_with_min_avg_max.png" exists on disk.
    // "cos_phi_l1_without_min_avg_max.png" is not present yet.
    file: "images/cos_phi_l1_without_min_avg_max.png",
    keywords: ["power factor without", "cos phi without", "power factor basic"]
  },
  {
    file: "images/cos_phi_l1_with_min_avg_max.png",
    keywords: ["power factor with", "cos phi with", "power factor precise", "power factor averaging"]
  },
  {
    file: "images/cos_psi_loading.png",
    keywords: ["displacement factor loading", "cos psi loading", "calculation in progress"]
  },
  {
    file: "images/cos_psi_aborted.png",
    keywords: ["displacement factor aborted", "cos psi aborted", "calculation stopped"]
  },
  {
    file: "images/cos_psi_complete.png",
    keywords: ["displacement factor complete", "cos psi complete", "calculation finished"]
  },
  {
    file: "images/display_times_table.png",
    keywords: ["display times", "display table", "performance timing", "min avg max timing"]
  },

  // ============ POWER AND ENERGY MODE IMAGES ============
  {
    file: "images/power-3l-powers-screen.png",
    keywords: ["3l powers screen", "active power 3l", "reactive power 3l", "distortion power 3l", "apparent power 3l", "powers display screen"]
  },
  {
    file: "images/power-3l-quantities-screen.png",
    keywords: ["quantities associated with the powers", "power factor 3l", "cos phi 3l", "tan phi 3l", "phase shift voltage current"]
  },
  {
    file: "images/power-3l-energies-consumed.png",
    keywords: ["energies consumed 3l", "energy consumed display", "active energy consumed", "reactive energy consumed"]
  },
  {
    file: "images/power-3l-energies-generated.png",
    keywords: ["energies generated 3l", "energy generated display", "active energy generated", "reactive energy generated"]
  },
  {
    file: "images/power-l1-powers-quantities.png",
    keywords: ["powers and associated quantities l1", "l1 powers screen", "l1 power factor", "l1 cos phi", "l1 tan phi"]
  },
  {
    file: "images/power-l1-energies-consumed-generated.png",
    keywords: ["energies consumed and generated l1", "l1 energy meters", "l1 energy consumed", "l1 energy generated"]
  },
  {
    file: "images/power-sigma-total-powers-quantities.png",
    keywords: ["total powers and associated quantities", "total active power", "total reactive power", "total power factor", "sigma powers"]
  },
  {
    file: "images/power-sigma-total-energies.png",
    keywords: ["total energies consumed and generated", "total energy meters", "sigma energy meters"]
  },
  {
    file: "images/power-energy-metering-startup-wh.png",
    keywords: ["energy metering start up", "start energy metering", "energy metering screen wh"]
  },
  {
    file: "images/power-energy-metering-recording-varh.png",
    keywords: ["energy metering screen varh", "energy metering in progress", "blinking play symbol energy"]
  },
  {
    file: "images/power-energy-metering-disconnected-varh.png",
    keywords: ["disconnection of energy metering", "suspend energy metering", "energy metering disconnected", "stop date energy metering"]
  },

  // ============ SCREEN SNAPSHOT MODE IMAGES ============
  {
    file: "images/snapshot-list-display.png",
    keywords: ["list of screen snapshots", "snapshot list", "recorded snapshots", "screen snapshot display", "list saved snapshots", "delete a snapshot", "memory indicator snapshot"]
  },

  // ============ HELP KEY IMAGES ============
  {
    file: "images/help-key-powers-energies-page1.png",
    keywords: ["help key", "help screen", "help function", "help mode", "reminder of the mode", "list of keys and icons", "help page 1", "help in progress"]
  },
  {
    file: "images/help-key-powers-energies-page2.png",
    keywords: ["help page 2", "list of symbols used", "inductive effect symbol", "capacitive effect symbol", "symbols used on the page"]
  },

  // ============ DATA EXPORT SOFTWARE IMAGES ============
  {
    // MISSING FILE: "images/data-export-cd-installation.png" does not exist in public/images.
    file: "images/data-export-cd-installation.png",
    keywords: ["install PAT2", "installation CD", "load the CD", "CD drive", "install data export software", "install the software"]
  },
  {
    file: "images/data-export-usb-connection.png",
    keywords: ["connect device to PC", "USB cord connection", "connect to computer", "USB port device", "connect device USB", "export data to PC", "transfer data to PC", "export data to computer", "transfer data to computer", "how to export data", "share data to PC", "share data with PC", "how to share data", "share data to computer", "share recorded data"]
  },

  // ============ GENERAL SPECIFICATIONS IMAGES ============
  {
    file: "images/general-specs-environmental-chart.png",
    keywords: ["environmental conditions chart", "temperature humidity chart", "reference range use range", "storage range batteries", "RH temperature graph"]
  },
];

function findMatchingImage(customerQuestion, aiAnswer) {
  const questionNormalized = normalizeForMatch(customerQuestion);
  let bestTopic = null;
  let bestScore = -1;

  // Check every topic's keywords (normalized) and keep the MOST SPECIFIC
  // match — the one with the most words, not just the most characters.
  // This makes a specific match like "4a rms" correctly win over a generic
  // one like "display", regardless of which word happens to be longer.
  // Matching is word-based (see keywordMatches), so extra words in the
  // question (like "(3L)" between "Vrms" and "with") no longer break it.
  for (const topic of IMAGE_MAP) {
    for (const keyword of topic.keywords) {
      const keywordNormalized = normalizeForMatch(keyword);
      if (keywordMatches(questionNormalized, keywordNormalized)) {
        const score = specificityScore(keywordNormalized);
        if (score > bestScore) {
          bestScore = score;
          bestTopic = topic;
        }
      }
    }
  }

  return bestTopic ? "/" + encodeURI(bestTopic.file) : null;
}

function extractUrls(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex) || [];
  return urls;
}

const FAQ_TEXT = `
GETTING STARTED — UNPACKING

Q: What comes in the box with my ALM31?
A: Your box includes safety cables, black crocodile clips, a USB cord, the mains power unit and cord, a carrying bag, colored rings to mark your phases and sensors, a safety sheet, a checking attestation, a quick start guide, a battery, and the device itself.

Q: How many safety cables come with the device?
A: You get 4 black safety cables with clips on both ends, tied together with a velcro strap.

Q: What are the colored rings for?
A: They are small marking rings you place on your leads and current sensors, so you can tell which phase each wire belongs to. There are 12 of them included.

Q: Does the device come with a carrying bag?
A: Yes, a No. 22 carrying bag is included to protect and carry your device and accessories.

Q: Is a battery included?
A: Yes, one battery comes with your device.

Q: What is the checking attestation for?
A: It is a document confirming your device was tested and checked before it was shipped to you. One copy comes included in the box.

GETTING STARTED — ACCESSORIES

Q: What accessories are available for my ALM31?
A: You can get different current clamps like MN93, MN93A, PAC93, C193, and AmpFlex or MiniFlex sensors in various sizes, plus adapters and the Dataview software.

Q: What is Dataview software used for?
A: Dataview is an optional companion software accessory for your device, used on a computer for more advanced analysis alongside your ALM31. It is separate from PAT2, which is the software actually used to export or transfer your recorded data to a PC.

Q: Where can I buy accessories or spare parts?
A: You can find accessories and spare parts on the KRYKARD website at https://atandra.in/measure/power-quality-analyzers

GETTING STARTED — SPARE PARTS

Q: What spare parts can I order?
A: You can order a replacement battery pack, USB cord, mains power unit, screen protection film, carrying bags, and replacement safety cable sets.

Q: Can I replace the screen protector?
A: Yes, a screen protection film is available as a spare part.

GETTING STARTED — CHARGING THE BATTERY

Q: How do I charge my ALM31 for the first time?
A: Before first use, fully charge the battery. Remove the cover from the charging socket, plug in the power unit, and connect the mains cord to the power supply and to a wall outlet.

Q: How do I know if it's charging?
A: A button on the device lights up while charging, and only turns off once you unplug the charger.

Q: How long does a full charge take?
A: If the battery is fully discharged, charging takes about 5 hours.

Q: What power supply does the device need?
A: It works with 120V at 60Hz or 230V at 50Hz, with about 10 percent tolerance either way.

GETTING STARTED — CHOICE OF LANGUAGE

Q: How do I choose the display language when I first turn on my device?
A: Press the green button to switch the device on. Then press the Configuration key. Press the yellow key next to the language you want.

Q: How do I turn on my ALM31 for the first time?
A: Press the green power button on the device.

Q: I don't see my language on the first screen, what do I do?
A: Press the key marked with the arrow to go to the next page of languages.

GETTING STARTED — INSTALLATION OF LEADS

Q: How do I install the leads and terminals on my ALM31?
A: Identify your leads and input terminals by marking them with the colored rings and inserts provided. Match them to your specific phase and neutral color code. Detach the insert and place it in the hole near the terminal. Use the large insert for a current terminal and the small insert for a voltage terminal. Clip rings of the same color to the ends of the lead you are connecting to the terminal. Connect the measurement leads to the terminals on the device. The ALM31 has 3 current input terminals and 4 voltage input terminals. After connecting the leads, remember to define the transformation ratios of the current sensors and the voltage inputs in the configuration menu.

Q: What are the colored rings and inserts for?
A: The colored rings help you mark which phase each lead belongs to. Inserts are plastic holders that fit into the connection terminals to help secure the leads.

Q: How many inserts are provided?
A: Several inserts are provided with your device - large ones for current terminals and small ones for voltage terminals. The exact number depends on your connection type.

Q: What is the difference between large and small inserts?
A: Large inserts are used for current input terminals, and small inserts are used for voltage input terminals.

Q: How many connection terminals does the ALM31 have?
A: The ALM31 has 3 current input terminals and 4 voltage input terminals for three-phase measurements.

Q: What should I do after connecting the leads?
A: After connecting the leads, you must define the transformation ratios of the current sensors and the voltage inputs in the Configuration menu. This ensures accurate measurements.

CONFIGURATION MENU

Q: How do I open the Configuration menu?
A: Press the Configuration button which is the gear icon on your device. A menu will appear on the screen with all settings options.

Q: How do I move around in the Configuration menu?
A: Use the arrow buttons up, down, left, and right to move around. When you find what you want, press ENTER to select it.

Q: How do I go back to the main screen?
A: Press the BACK button. This takes you one step back. Keep pressing it until you reach the main screen.

DISPLAY LANGUAGE

Q: How do I change the language on my screen?
A: Press the Configuration button. Look for Display Language. Press the yellow button below the language you want. The active language will light up in yellow.

Q: What languages can I choose?
A: Your device supports multiple languages like English, French, Spanish, German, Chinese, and many others. Just select the one you want.

Q: How do I know which language is currently active?
A: The active language is shown with a yellow background on its button.

DATE & TIME

Q: How do I set the date on my device?
A: Press Configuration button, then select Date Time. Use arrow up and down to change the date. Use arrow left and right to move to the next field. Press ENTER to confirm.

Q: How do I set the time on my device?
A: Press Configuration button, then select Date Time. Move to the time fields using arrow buttons. Adjust hours and minutes. Press ENTER to save.

Q: Can I choose 12-hour or 24-hour time format?
A: Yes. You can choose 12-hour format with AM and PM or 24-hour format which is military time. Select which one you prefer in the Date Time menu.

Q: Why is the date and time important?
A: The date and time are recorded with every measurement. This helps you know exactly when each measurement was taken. This is very important for keeping records.

DISPLAY SETTINGS

Q: How do I make the screen brighter or darker?
A: Press Configuration button, select Display, then choose Brightness. Use arrow left and right to increase or decrease brightness. The screen will change in real-time.

Q: How many brightness levels are available?
A: You have a slider where you can adjust brightness from LOW to HIGH. Find the level that is comfortable for your eyes.

Q: Can I change the colors of the measurement curves?
A: Yes. Your device offers 15 different colors to choose from including Green, Dark Green, Yellow, Orange, Pink, Red, Brown, Blue, Turquoise, Dark Blue, Light Grey, Grey, Dark Grey, and Black.

Q: How do I change the color of a measurement line?
A: Press Configuration button, select Display, then Colors. Use arrow buttons to select which line to change. Choose a color you like. Press ENTER.

Q: What does "Screen Shutdown" mean?
A: This is when your screen automatically turns OFF to save battery. You have two choices: Automatic which turns off after a few minutes of no use or Never which keeps it on all the time.

Q: How long before the screen turns off automatically?
A: If you choose Automatic mode, the screen turns off after 5 to 10 minutes depending on whether you are recording data or not.

Q: What is Night Mode?
A: Night Mode changes your screen to white text on black background. This is easier on your eyes in dark environments.

Q: How do I turn on Night Mode?
A: Press Configuration button, select Display, then Night Mode. Use arrow up and down to activate or deactivate it. The screen colors will change instantly.

CALCULATION METHODS

Q: What are "Calculation Methods"?
A: These are different ways your device calculates electrical measurements. They are advanced settings that most users do not need to change. The device comes with good default settings.

Q: What does "Non-active Quantities" mean?
A: This is how your device counts wasted power in your electrical system. You can choose Broken Down which shows wasted power in separate categories or Not Broken Down which shows total as one number.

Q: What is the "K Factor"?
A: The K Factor tells you how much your transformer or electrical equipment will overheat due to messy, irregular electrical signals. Higher K Factor means more heat.

Q: Do I need to change K Factor settings?
A: No. Most of the time, the default values work fine. Only change if your engineer specifically asks.

Q: What does "Harmonic Reference Level" mean?
A: This tells your device how to measure electrical noise which is called harmonics. You can compare to the main signal or to the total signal.

CONNECTION TYPE

Q: What does "Connection" mean?
A: This tells your device what TYPE of electrical system you are measuring. It could be single-phase with 1 live wire, split-phase with 2 live wires, or three-phase with 3 live wires.

Q: How do I know if my building is single-phase or three-phase?
A: Look at your electrical panel. Single-phase means 1 or 2 main wires. Three-phase means 3 or 4 main wires. Or just ask your electrician.

Q: How do I configure the connection type?
A: Press Configuration button, select Connection. Use arrow buttons to select YOUR connection type. Press ENTER to confirm.

Q: What are the connection options available?
A: You can choose from single-phase with 2 wires, split-phase with 3 wires, three-phase with 3 wires or 4 wires, plus several other specialized configurations.

Q: What if I choose the wrong connection type?
A: Your measurements will be WRONG. The device will not measure correctly. Make sure you know your electrical system before selecting.

Q: What is "Three-phase star connection"?
A: This is a common three-phase setup where all three wires meet at a central point. This is very common in factories.

Q: What is "Three-phase delta connection"?
A: This is another three-phase setup where wires form a triangle. This is also common in industrial settings.

SENSORS AND RATIOS

Q: What are "Current Sensors"?
A: These are special clamps you connect to your electrical wires to measure current which is electrical flow. Different sensors measure different ranges.

Q: What current sensors can I use?
A: Your device works with many sensors including MN93 which measures up to 200 amps, MN93A for 100 amps, C193 for 1000 amps, AmpFlex for 10000 amps, and many more.

Q: How do I configure current sensors?
A: Press Configuration button, select Sensors and Ratios, then Current Sensors. The device will automatically detect which sensor you connected. Adjust the ratio if needed. Press ENTER.

Q: What is a "Current Ratio"?
A: A ratio is a multiplier that converts the sensor reading to the actual current. For example if your sensor measures 5 amps and ratio is 100, actual current is 500 amps.

Q: How do I set the current ratio?
A: Go to Sensors and Ratios, then Current Sensors. Use arrow buttons to select which sensor. Change the ratio using number keys. Press ENTER to confirm.

Q: What are "Voltage Ratios"?
A: A voltage ratio is a multiplier for voltage measurements. It converts the device reading to actual voltage. This is useful for measuring very high voltages safely.

Q: How do I configure voltage ratios?
A: Go to Sensors and Ratios, then Voltage Ratios. Choose if all channels have same ratio or different ratios. Enter the ratio values. Press ENTER to save.

TREND MODE - SECTION 9

Q: What is Trend Mode?
A: Trend Mode records measurements over time. Instead of single snapshots, it logs data continuously so you can see how things change over hours, days, or weeks.

Q: How do I configure trend recording?
A: Press Configuration button, select Trend Mode. Choose what to record such as Voltage, Current, Power, Harmonics, and so on. Mark which parameters you want logged. Press ENTER.

Q: What can I record in Trend Mode?
A: You can record Voltage which includes RMS, DC, and Harmonics. Also Current with RMS, DC, and Harmonics. Power which includes Active, Reactive, and Apparent. Also Power Factor, Frequency, Harmonics, Energy consumption, and many more.

Q: How many independent recordings can I set up?
A: You can create 4 independent recording configurations. Each can record different parameters and different time periods.

Q: What is the recording period?
A: You can choose how often to record data. Options are 1 second for very detailed data, 5 seconds, 20 seconds, 1 minute which is most common, or 5, 10, 15 minutes for less detail but saves space.

Q: How much data can I store?
A: Your device has 2 GB of memory. That is enough for weeks of data depending on recording frequency.

Q: How do I start a trend recording quickly?
A: To start a recording rapidly, press the green button key. Recording starts immediately. All measurements are recorded every second until the memory is completely full. The default configuration is used.

Q: What does the black part of the recording list bar mean?
A: The black part of the bar corresponds to the fraction of memory used. This helps you visualize how much storage space has been consumed by your recordings.

Q: Why is my stop date shown in red in the recording list?
A: If the stop date is in red, it means that it does not match the stop date initially programmed. This typically occurs due to a power supply problem, such as the battery being low or the device being disconnected from mains power.

Q: How can I delete a recording?
A: When the list of records is displayed, move the cursor to the recording using the arrow keys. The selected recording will be bolded. Then press the delete key to validate the deletion.

Q: What is the difference between displaying curves with and without MIN-AVG-MAX mode?
A: Without MIN-AVG-MAX, the display shows one data point per minute, resulting in loss of 59 out of 60 values. Display is faster. With MIN-AVG-MAX, the display shows the arithmetic mean of 60 values, providing more precise data with no information loss, but slower calculation.

Q: What does MIN-AVG-MAX mode display for current curves?
A: With MIN-AVG-MAX activated, the display shows three distinct curves. Mean curve represents the arithmetic mean of 60 values recorded every second. Maximum curve shows the maximum of the 60 values. Minimum curve shows the minimum of the 60 values.

Q: How long does it take to display curves for different time windows?
A: Display times vary significantly. For example, 5 days with MIN-AVG-MAX deactivated takes 11 seconds, while 5 days with MIN-AVG-MAX activated takes 10 minutes. 1 hour takes 1 to 8 seconds either way.

Q: Can I stop a curve display if it's taking too long?
A: Yes. Press the stop key at any time to stop the display loading and calculation. However, note that restarting may restart the loading from the beginning.

Q: Why doesn't a measurement appear in the tabs when viewing records?
A: If a measurement does not appear in the tabs, it is because calculation of this measurement was incompatible with the configuration chosen. This can occur due to connection type issues, sensor types not properly configured, or ratios not properly programmed.

Q: What do dashes in a display mean?
A: Dashes indicate that the value is not available at the cursor position because it was not calculated. This can occur if the calculation was aborted before completion or the value hasn't been computed yet for that time point.

Q: How do I change the scale of the display for curves?
A: Press the left or right arrow key to change the scale of the display. You can adjust the time window between 1 minute and 5 days depending on the curve type.

Q: What is the recording period for trend data?
A: The standard recording period is one second. This means all measurements are recorded every second, unless configured differently.

Q: When is MIN-AVG-MAX mode not available?
A: The MIN-AVG-MAX mode is not available while a trend is being recorded. You can only use this mode after a recording has been completed.

Q: How is the energy calculation performed?
A: The energy calculation mode determines the sum of the powers for selected bars. With one-second recording period and one-minute display period, each bar represents the energy accumulated in that minute. With MIN-AVG-MAX mode, the precision improves significantly.

Q: Can I view multiple phases simultaneously?
A: Yes. You can view measurements for individual phases L1, L2, L3 separately, and also total sum measurements for three-phase systems. For three-phase sources without neutral, only total quantities are represented.

POWER AND ENERGY MODE - SECTION 10

Q: What is Power and Energy Mode?
A: Power and Energy Mode shows you all measurements related to power and energy. Press the W key on the device to open it.

Q: What sub-menus are available in Power and Energy Mode?
A: You can view Powers, the quantities associated with the powers such as power factor, Energies Consumed, and Energies Generated.

Q: What happens if my connection is 2-wire single-phase?
A: For a 2-wire single-phase connection, only the L1 selection is available. The filter is not shown, but the display works the same as for L1.

Q: What happens if my connection is 3-wire three-phase?
A: For a 3-wire three-phase connection, only the total, or Sigma, selection is available. The filter is not shown, but the display works the same as for the total.

SECTION 10.1: 3L FILTER - POWERS DISPLAY SCREEN

Q: What does the Powers display screen show in 3L?
A: The W sub-menu shows you Active power, Reactive power, Distortion power, and Apparent power for all three phases.

Q: What is Active power?
A: Active power is the real power your load actually uses to do work, shown in Watts.

Q: What is Reactive power?
A: Reactive power is the power that goes back and forth without doing useful work, shown in var.

Q: What is Distortion power?
A: Distortion power is the power caused by harmonics and irregularities in your electrical signal, shown in var.

Q: What is Apparent power?
A: Apparent power is the total combined power in your system, shown in VA.

Q: Why does the Distortion power label sometimes change?
A: This screen corresponds to the choice of non-active quantities in the Calculation Methods menu of Configuration mode. If you chose non-active quantities broken down, you see the D label for distortion power. If you chose non-active quantities not broken down, the D label disappears and is replaced by the N label instead. This non-active power has no inductive or capacitive effect.

SECTION 10.1.2: QUANTITIES ASSOCIATED WITH THE POWERS

Q: What does the PF sub-menu show?
A: The PF sub-menu shows you the quantities associated with the powers, meaning Power factor, cos phi, tan phi, and the phase shift angle.

Q: What is Power factor?
A: Power factor tells you how efficiently your electrical power is being used.

Q: What is cos phi?
A: Cos phi is the fundamental power factor, also called the displacement factor or DPF.

Q: What is tan phi?
A: Tan phi is the tangent of the phase shift between voltage and current.

Q: What is the phase shift angle shown as Phi VA?
A: This is the phase shift of the voltage with respect to the current, shown in degrees.

SECTION 10.1.3 AND 10.1.4: ENERGIES CONSUMED AND GENERATED

Q: What does the Energies Consumed display screen show?
A: The energy meters sub-menu shows you the meters of energy consumed by your load, meaning Active energy, Reactive energy, Distortion energy, and Apparent energy.

Q: What does the Energies Generated display screen show?
A: This shows the meters of the energy generated by your load, with the same categories as energy consumed, Active, Reactive, Distortion, and Apparent energy.

Q: What is the Inductive reactive effect?
A: This is an icon shown on the energy screens that indicates an inductive reactive effect in your system.

Q: What is the Capacitive reactive effect?
A: This is an icon shown on the energy screens that indicates a capacitive reactive effect in your system.

Q: Why does the Distortion energy label sometimes change on this screen?
A: This screen also corresponds to the non-active quantities choice in the Calculation Methods menu. If broken down is chosen, you see the Dh label for distortion energy. If not broken down is chosen, the Dh label disappears and is replaced by the Nh label. This non-active energy has no inductive or capacitive effect.

SECTION 10.2: FILTERS L1, L2 AND L3

Q: What does the Powers and Associated Quantities screen show for L1?
A: For phase L1, this screen shows Active power, Reactive power, Distortion power, Apparent power, plus Power factor, cos phi, tan phi, and the phase shift of voltage with respect to current.

Q: Do filters L2 and L3 show the same information as L1?
A: Yes. Filters L2 and L3 display the same type of information as L1, just for their own respective phase.

Q: What does the Energy Meters display screen show for L1?
A: The Wh sub-menu shows you the meters of energy consumed by the load and the meters of energy generated by the load, for Active, Reactive, Distortion, and Apparent energy.

SECTION 10.3: FILTER SIGMA (TOTAL)

Q: What does the Total Powers and Associated Quantities screen show?
A: In the Sigma filter, you see the Total active power, Total reactive power, Total distortion power, Total apparent power, Total power factor, Total fundamental power factor, and Total tangent.

Q: What does the Total Energy Meters display screen show?
A: The Wh sub-menu in Sigma shows the meters of the total energy consumed by the load and the meters of the total energy generated by the load, covering Total active, Total reactive, Total distortion, and Total apparent energy.

Q: How is power calculated for a 3-wire three-phase setup?
A: For a 3-wire three-phase setup, only the display of total quantities is available. The method of calculation of the powers used is the two-wattmeter method.

SECTION 10.4: STARTING ENERGY METERING

Q: How do I start energy metering?
A: Press the Play key in an energies display screen. This can be in the Energies Consumed screen, Energies Generated screen, or the Wh screen.

Q: How do I know energy metering has started?
A: The start date and time of the energy metering are shown on the screen. A blinking Play symbol indicates that energy metering is in progress.

Q: What does the suspend icon do during energy metering?
A: The suspend icon is used to pause the energy metering without resetting the values.

Q: What is the non-nullity threshold for energy metering?
A: The non-nullity threshold is 11.6 kWh for non-nuclear toe and 3.84 kWh for nuclear toe.

SECTION 10.5: DISCONNECTION OF ENERGY METERING

Q: How do I pause or suspend energy metering?
A: Press the suspend key to suspend energy metering.

Q: Is disconnecting energy metering permanent?
A: No. A disconnection of the metering is not definitive. It can be resumed at any time by pressing the Play key again.

Q: What happens to the display when I disconnect energy metering?
A: The stop date and time of the metering are displayed alongside the start date and time.

Q: What happens if no recording is in progress when I disconnect energy metering?
A: If no recording is in progress, disconnecting the energy metering causes the blinking Play symbol to appear in the status bar in place of the suspend symbol. It also replaces the suspend key with the reset key.

SECTION 10.6: RESET OF ENERGY METERING

Q: How do I reset energy metering?
A: First, press the suspend key to suspend the metering. Then press the reset key and confirm with the enter key.

Q: What happens when I reset energy metering?
A: All energy values, both consumed and generated, are reset back to zero.

SCREEN SNAPSHOT MODE - SECTION 11

Q: What is Screen Snapshot mode?
A: Screen Snapshot mode lets you take up to 12 screen snapshots and display the recorded snapshots. Use the snapshot key to take up to 12 screen snapshots.

Q: How do I take a screen snapshot?
A: Press and hold the snapshot key for about 3 seconds to shoot the screen currently displayed.

Q: How do I know a snapshot has been taken?
A: When a screen snapshot is taken, the icon of the active mode in the top strip of the display is replaced by the snapshot icon. You can then release the snapshot key.

Q: Can I transfer my saved screen snapshots to a computer?
A: Yes. Saved screens can be transferred to a PC using the PAT application, which stands for Power Analyser Transfer.

Q: How many screen snapshots can the device store?
A: The device can record only 12 screen snapshots.

Q: What happens if I try to take a 13th snapshot?
A: If you try to record a 13th screen, the device tells you that snapshots must be deleted first. It shows the reset or delete icon in place of the snapshot icon.

SECTION 11.2: HANDLING OF SCREEN SNAPSHOTS

Q: How do I view my list of saved snapshots?
A: Briefly press the snapshot key. The device then displays a list of your recorded screen snapshots.

Q: What does the black bar on the snapshot list screen mean?
A: This is the memory indicator. The black part of the bar represents memory already used, and the white part represents memory still available.

Q: What information is shown for each saved snapshot in the list?
A: Each icon in the list represents the type of screen recorded, followed by the date and time the screen snapshot was taken.

SECTION 11.2.1: VIEWING A SNAPSHOT FROM THE LIST

Q: How do I view a specific snapshot from the list?
A: Use the up, down, left, and right arrow keys to select a snapshot in the list. The date and time of the selected snapshot will appear bolded.

Q: How do I open a selected snapshot?
A: Press the enter key to display the selected snapshot. The snapshot icon is shown alternating with the icon for whichever mode was active when the snapshot was taken.

Q: How do I go back to the list of snapshots after viewing one?
A: Press the return key to go back to the list of screen snapshots.

SECTION 11.2.2: DELETING A SNAPSHOT FROM THE LIST

Q: How do I delete a screen snapshot?
A: Use the up, down, left, and right arrow keys to select the snapshot you want to delete in the list. The date and time of the selected snapshot will appear bolded. Then press the delete key and confirm by pressing enter. The snapshot will then disappear from the list.

Q: Can I cancel a snapshot deletion?
A: Yes. Instead of pressing enter to confirm, press the return key to cancel the deletion.

HELP KEY - SECTION 12

Q: What does the Help key do?
A: The Help key provides information about the key functions and symbols used in whichever display mode you are currently in.

Q: What information does the help screen show?
A: The help screen shows a reminder of the mode you are using, a list of information about the keys and icons for that mode, and it also lets you know that help is in progress.

Q: How many help pages are there?
A: There can be more than one help page, for example page 1 and page 2, depending on how much information there is for that mode.

Q: What does help page 1 show for the Powers and Energies mode?
A: Help page 1 shows a list of the keys and icons used in Powers and Energies mode, such as display powers, display power-derived values, supply side, select display filter, phase sum, restart energy meters, enable energy meter reset, channel not saturated, and potential channel saturation.

Q: What does help page 2 show for the Powers and Energies mode?
A: Help page 2 shows a list of symbols used on the page, such as the inductive effect symbol, capacitive effect symbol, active energy on the load side, reactive energies on the load side, distortion energy on the load side, and apparent energy on the load side.

Q: How do I switch between help pages?
A: Use the page keys shown at the bottom of the help screen, for example page 1 or page 2, to move between the available help pages for that mode.

DATA EXPORT SOFTWARE - SECTION 13

Q: What is PAT2?
A: PAT2, which stands for Power Analyser Transfer 2, is the data export software supplied with your device. It is used to transfer the data recorded in the device to a PC.

Q: How do I export or transfer data from my ALM31 to my PC?
A: Use the PAT2 software supplied with your device, not Dataview. First connect your device to your PC using the USB cord supplied, after removing the cover that protects the USB port. Then switch the device on and wait for your PC to detect it. The PAT transfer software automatically defines the communication rate between the PC and the device, and all your recorded measurements can then be transferred.

Q: What is the difference between PAT2 and Dataview?
A: PAT2 is the data export software that comes supplied with your device, used specifically to transfer recorded measurements to a PC. Dataview is a separate companion software accessory you can purchase for more advanced analysis on your computer. For simply exporting your recorded data, use PAT2.

Q: How do I install the PAT2 software?
A: Load the installation CD into the CD drive of your PC, then follow the instructions shown on screen.

Q: How do I connect my device to my PC?
A: Connect the device to the PC using the USB cord supplied. First remove the cover that protects the USB port on the device, then plug in the cord.

Q: How do I start transferring data to my PC?
A: Switch the device on by pressing the power key, then wait for your PC to detect it.

Q: How does the device communicate with the PC?
A: The PAT transfer software automatically defines the communication rate between the PC and the device. You do not need to configure this yourself.

Q: Does transferring data to my PC erase it from the device?
A: No. All measurements recorded in the device can be transferred to the PC. The transfer does not erase the recorded data unless you explicitly ask it to.

Q: Where can I get help using the data export software?
A: For directions on using the data export software, use its built-in Help function or refer to its user manual.

GENERAL SPECIFICATIONS - SECTION 14

SECTION 14.1: ENVIRONMENTAL CONDITIONS

Q: What temperature and humidity conditions can the device handle?
A: The device has an environmental conditions chart showing four ranges. Range 1 is the reference range. Range 2 is the range for use. Range 3 is the range for storage with batteries installed. Range 4 is the range for storage without batteries installed.

Q: Can I power the device with both the battery and mains power at the same time above 40 degrees Celsius?
A: No. At temperatures above 40 degrees Celsius, the device must be powered by the battery alone, or by the mains power unit alone. Using both the battery and the mains power unit together at the same time is prohibited above this temperature.

Q: What altitude is the device rated for?
A: For use, the device is rated up to 2000 meters altitude. For storage, it is rated up to 10000 meters altitude.

Q: What is the degree of pollution rating?
A: The device has a degree of pollution rating of 2.

Q: Is the device meant for indoor or outdoor use?
A: The device is designed for indoor use.

SECTION 14.2: MECHANICAL CONDITIONS

Q: What are the dimensions of the device?
A: The device measures 200 millimeters by 250 millimeters by 70 millimeters, length by width by height.

Q: How much does the device weigh?
A: The device weighs approximately 2 kilograms.

Q: What is the screen size?
A: The screen measures 118 millimeters by 90 millimeters, with a diagonal of 148 millimeters.

Q: What is the tightness or ingress protection rating of the device?
A: The device has an IP53 rating per EN 60529 when it is on its stand, with no lead connected, and with the jack cover and USB cap in the closed position. It has an IP20 rating at the level of the measurement terminals, and an IK08 rating per EN 62262.

Q: What fall height is the device rated to survive?
A: The device is rated to survive a fall of 1 meter, as per IEC 61010-1.

SECTION 14.3: OVERVOLTAGE CATEGORIES

Q: What overvoltage categories is the device compliant with?
A: The device is compliant with IEC 61010-1, rated 600 Volts RMS category 4, or 1000 Volts RMS category 3.

Q: How does the sensor I use affect the overvoltage category?
A: Using an AmpFLEX or MiniFLEX sensor, or a C193 clamp, keeps the device and current sensor system at 600 Volts category 4 or 1000 Volts category 3. Using a PAC93, J93, MN93, MN93A, or E3N clamp downgrades the system to 300 Volts category 4 or 600 Volts category 3. Using the 5 Amp adapter unit downgrades the system further to 150 Volts category 4 or 300 Volts category 3.

Q: Is the device double insulated?
A: Yes. There is double insulation between the inputs and outputs and earth, and double insulation between the voltage inputs, the power supply, and the other inputs and outputs.

SECTION 14.4: ELECTROMAGNETIC COMPATIBILITY

Q: What electromagnetic compatibility standard does the device meet?
A: For emissions and immunity, the device belongs to Group 1, Class A, under the standard EN55011, in an industrial setting compliant with IEC 61326-1. Class A devices are intended for use in industrial environments, and there may be difficulties ensuring electromagnetic compatibility in other environments due to conducted and radiated disturbances.

Q: How does radio frequency immunity affect measurements when using AmpFLEX or MiniFLEX sensors?
A: For AmpFLEX and MiniFLEX sensors, the device is equipment intended for use at industrial sites under standard IEC61326-1. An absolute influence of 2 percent may be observed on the current THD measurement in the presence of a radiated electric field. An influence of 0.5 Amp may be observed on the RMS current measurement in the presence of conducted radio frequencies. An influence of 1 Amp may be observed on the RMS current measurement in the presence of a magnetic field.

SECTION 14.5: POWER SUPPLY

Q: What are the mains power supply specifications?
A: The mains power supply is a specific 600 Volts RMS category 4, or 1000 Volts RMS category 3, external mains power supply unit. The range of use is 230 Volts plus or minus 10 percent at 50 Hertz, or 120 Volts plus or minus 10 percent at 60 Hertz. Maximum input power is 65 Volt-Amps.

Q: What are the battery power supply specifications?
A: The device is supplied by a 9.6 Volt, 4000 milliamp-hour battery pack, made up of 8 rechargeable NiMH cells. The battery has 8 NiMH storage cells, a capacity of 4000 milliamp-hours nominal, a nominal voltage of 1.2 Volts per cell or a total of 9.6 Volts, a life of at least 300 charge-discharge cycles, a charging current of 1 Amp, and a charging time of approximately 5 hours.

Q: What temperature range can the battery operate and charge in?
A: The battery service temperature range is 0 to 50 degrees Celsius. The charging temperature range is 10 to 40 degrees Celsius.

Q: What temperature range should the battery be stored in?
A: For storage of 30 days or less, keep the battery between minus 20 and 50 degrees Celsius. For storage of 30 to 90 days, keep it between minus 20 and 40 degrees Celsius. For storage of 90 days to 1 year, keep it between minus 20 and 30 degrees Celsius.

Q: What should I do if I leave the device unused for a long time?
A: If the device is to be left unused for an extended period, remove the battery.

Q: What is the typical power consumption of the device?
A: When the battery is being charged, the device typically consumes 17 Watts of active power, 30 VA of apparent power, and 130 milliamps of RMS current. When the battery is fully charged, it consumes 6 Watts of active power, 14 VA of apparent power, and 60 milliamps of RMS current.

Q: How long does the battery last?
A: Battery life is 10 hours when the battery delivered with the device is fully charged and the display screen is on. If the display is off to save energy, battery life is more than 15 hours.

SECTION 14.5.5: DISPLAY UNIT

Q: What type of display does the device have?
A: The display unit is an active matrix TFT LCD type display.

Q: What is the resolution and size of the display?
A: The display has a diagonal of 5.7 inches and a resolution of 320 by 240 pixels, which is one quarter VGA.

Q: What are the display's brightness and viewing characteristics?
A: The display has a minimum luminosity of 210 candelas per square meter, typically 300 candelas per square meter, a response time between 10 and 25 milliseconds, an angle of view of 80 degrees in all directions, and excellent rendering from 0 to 50 degrees Celsius.

ALARM MODE (FOR THE ALM 33 ONLY) - SECTION 8

Q: What is Alarm mode?
A: Alarm mode detects overshoots of thresholds on each of the measured parameters. This includes frequency, RMS voltages and currents, unbalance, power factor values, angle values, flicker, harmonic loss factor, K factor, and neutral voltage or current for a three-phase source without neutral. See the table of abbreviations for the full parameter list.

Q: What conditions must be met for an alarm threshold to work?
A: The alarm thresholds must have been programmed in the Configuration, Alarm mode screen. They must also be active, which is marked with a red spot on that same screen.

Q: How many alarms can the device store?
A: Stored alarms can be transferred to a PC using the PAT application. You can capture over 4,000 alarms.

Q: What do the Play and Stop icons do in Alarm mode?
A: The Play icon validates the programming of a campaign and starts the alarm campaign. The Stop icon voluntarily stops the alarm campaign.

SECTION 8.1: ALARM MODE CONFIGURATION

Q: What does the Alarm mode configuration shortcut show?
A: The alarm mode configuration submenu displays the list of alarms configured. This shortcut key lets you define or change alarm configurations.

Q: How do I return from the Alarm mode configuration screen?
A: Press the return key to go back to the Programming a Campaign screen.

SECTION 8.2: PROGRAMMING AN ALARM CAMPAIGN

Q: How do I program an alarm campaign?
A: The programming submenu is used to specify the start and stop times for an alarm campaign. To program a campaign, enter the start date and time, the stop date and time, and the name of the campaign.

Q: How do I change a value while programming an alarm campaign?
A: Move the yellow cursor to the item using the up and down arrow keys, then validate with the enter key. Change the value using the up, down, left, and right keys, then validate again.

Q: How long can the campaign name be?
A: The name can be at most 8 characters long. Several campaigns may have the same name. The available alphanumeric characters are the uppercase letters A to Z and the digits 0 to 9.

Q: Does the device remember previous campaign names?
A: Yes. The last 5 names given in the transient, trend, and alarm modes are kept in memory. When a name is entered, it may then be completed automatically.

Q: What are the rules for the start and stop date and time of an alarm campaign?
A: The start date and time must be later than the current date and time. The stop date and time must be later than the start date and time.

Q: Can I program an alarm campaign while an inrush current capture is in progress?
A: No. It is not possible to program an alarm campaign if an inrush current capture is in progress.

Q: How do I start an alarm campaign once it's programmed?
A: Once the programming is done, start the campaign by pressing the Play key. The Play icon of the status bar blinks to indicate that the campaign has been started.

Q: How do I stop an alarm campaign before it finishes?
A: The Stop key replaces the Play key once a campaign has started, and can be used to stop the campaign before it is finished.

Q: What counts as a recorded alarm if I stop the campaign early?
A: Alarms in progress that have not yet ended are recorded in the campaign if their duration is equal to or greater than their programmed minimum duration.

Q: What does "Campaign on standby" mean?
A: This message is displayed until the start time is reached.

Q: What does "Campaign running" mean?
A: This message replaces "Campaign on standby" once the start time is reached. When the stop time is reached, the Programming a Campaign screen returns with the Play key, and you can then program another campaign.

Q: Can I change settings while an alarm campaign is running?
A: During an alarm campaign, only the stop date field can be modified. It is automatically highlighted in yellow.

SECTION 8.3: DISPLAY OF THE LIST OF CAMPAIGNS

Q: How do I view the list of alarm campaigns performed?
A: Press the list key. The List of Alarm Campaigns screen is displayed. The list can contain up to 2 campaigns.

Q: What information does the list of campaigns show?
A: The list shows the name of the campaign, the start date and time of the campaign, and the stop date and time of the campaign.

Q: What does it mean if the stop date of a campaign is shown in red?
A: It means the stop date does not match the stop date initially programmed. This can happen either because of a power supply problem, such as low battery or the device being disconnected from mains-only power, or because the memory is full.

SECTION 8.4: DISPLAY OF LIST OF ALARMS

Q: How do I view the alarms recorded for a campaign?
A: Select a campaign by moving the cursor to it using the up and down arrow keys. The selected field is bolded. Validate with the enter key. The device then displays the alarms in list form.

Q: What information does the alarm list show?
A: The alarm list shows the alarm date and time, the type of alarm detected, the target of the alarm detected, the extremum of the alarm detected which is the minimum or maximum depending on the programmed alarm direction, and the alarm duration.

Q: What does the memory fill level bar show?
A: This is the level of filling dedicated to the alarm mode. The black part of the bar corresponds to the fraction of memory used.

Q: Does the filter choice on the alarm list stay the same?
A: No. The choice of filter is dynamic. It depends on the connection chosen.

Q: What does it mean if an alarm duration is shown in red?
A: It means the alarm was cut short. This can be because of a power supply problem such as low battery, because of a manual stoppage of the campaign by pressing Stop or switching off the device, because the memory is full, because of a measurement error, or because of an incompatibility between the quantity monitored and the configuration of the device, for example the withdrawal of a current sensor.

Q: If an alarm was cut short, is anything else shown in red?
A: Yes. In the last two cases, meaning a measurement error or an incompatibility with the device configuration, the extremum is also displayed in red.

Q: How do I go back to the list of campaigns from the alarm list?
A: Press the return key to return to the List of Campaigns screen.

SECTION 8.5: DELETING AN ALARM CAMPAIGN

Q: How do I delete an alarm campaign?
A: When the list of campaigns performed is displayed, select the campaign to be erased. This is done by moving the cursor to it using the up and down arrow keys. The selected campaign is bolded. Then press the yellow key. Press enter to validate or the return key to cancel.

Q: Can I delete an alarm campaign that is currently in progress?
A: No. It is not possible to delete the alarm campaign in progress.

SECTION 8.6: ERASING ALL ALARM CAMPAIGNS

Q: How do I erase all alarm campaigns at once?
A: Erasing all of the alarm campaigns is only possible from the Configuration menu, in the Erasure of Data submenu.

Q: Can I erase individual campaigns from the Configuration menu, or only all of them at once?
A: The Erasure of Data submenu in the Configuration menu erases all alarm campaigns together. To delete a single campaign instead, use the delete option from the List of Campaigns screen.
`;

const LANGUAGE_NAMES = {
    en: "English",
    ta: "Tamil",
    hi: "Hindi"
    
};

function buildSystemInstruction(languageCode) {
    const languageName = LANGUAGE_NAMES[languageCode] || "English";

    const languageRule = languageCode === "en"
        ? `Respond in English.`
        : `Respond ONLY in ${languageName}, written in native ${languageName} script.
The knowledge below is written in English — translate the meaning accurately into ${languageName} yourself.
Use simple, everyday spoken ${languageName} that an ordinary customer would use in conversation. Avoid formal, literary, or overly bookish words when a simpler common word means the same thing.
Keep ONLY short standard technical terms in English/Roman letters — things like ALM31, USB, K Factor, RMS, THD, MIN-AVG-MAX. These stay in English because customers already know them that way.
For every other word, including ordinary verbs, status words, and adjectives (for example "activated", "deactivated", "on", "off", "enabled", "disabled"), pick ONE version and commit to it — either translate it naturally into ${languageName}, or say it in English — and use that same choice consistently. NEVER write both the ${languageName} word and the English word together for the same idea, such as "മറൈന്നിരുന്നാൽ (Deactivated)". Giving the same meaning twice in two languages is confusing to hear out loud and must not happen.
Do not mix in English sentences. The entire reply must be in ${languageName}, aside from the short technical terms noted above.`;

    return `
You are the ALM31 Assistant.

You are a friendly voice-and-text assistant that helps customers understand and use the ALM31 Power Quality Analyzer.

CURRENT AVAILABLE SECTIONS:
GETTING STARTED, CONFIGURATION, DESCRIPTION OF THE DEVICE, HARMONIC MODE, TRANSIENT MODE, WAVEFORM MODE, TREND MODE, POWER AND ENERGY MODE, SCREEN SNAPSHOT MODE, HELP KEY, DATA EXPORT SOFTWARE, GENERAL SPECIFICATIONS, and ALARM MODE.

IMPORTANT:
The customer does NOT need to use the exact wording of a stored question.
You must understand the meaning of the customer's question.
Use ONLY the knowledge provided.
Do not invent technical information.
Use simple language for voice.
Keep answers short and natural.
Never tell the customer to read the manual.
Give the answer directly.
Do not use asterisks, markdown formatting, bullet symbols, or any special characters like *, **, #, or _ in your answers.
When an answer has multiple steps or items, list them as plain numbers like 1. 2. 3. instead of bullet points or asterisks.
Write in plain sentences and numbered lists only, as if speaking out loud.
${languageRule}

KNOWLEDGE:

${FAQ_TEXT}
`;
}

app.post("/api/chat", async (req, res) => {
    try {
        const { message, language } = req.body;

        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                error: "Please enter a question."
            });
        }

        const customerQuestion = message.trim();
        const languageCode = LANGUAGE_NAMES[language] ? language : "en";

        console.log("Customer:", customerQuestion, "| Language:", languageCode);

        const interaction = await ai.interactions.create({
            model: MODEL_NAME,
            system_instruction: buildSystemInstruction(languageCode),
            input: customerQuestion,
            generation_config: {
                temperature: 0.2
            }
        });

        let answer = interaction.output_text;

        // Safety net: strip any stray markdown asterisks Gemini might still add
        answer = answer.replace(/\*\*/g, "").replace(/\*/g, "");

        console.log("ALM31 Assistant:", answer);

        const videoUrl = findMatchingVideo(customerQuestion, answer);
        const imageUrl = findMatchingImage(customerQuestion, answer);
        const accessLinks = extractUrls(answer);

        res.json({
            answer: answer,
            section: "Getting Started / Configuration / Device Description / Harmonic Mode / Transient Mode / Waveform Mode / Trend Mode / Power and Energy Mode / Screen Snapshot Mode / Help Key / Data Export Software / General Specifications / Alarm Mode",
            videoUrl: videoUrl,
            imageUrl: imageUrl,
            links: accessLinks
        });

    } catch (error) {
        console.error("Gemini API error:", error);
        res.status(500).json({
            error: "Sorry, I could not process your question right now."
        });
    }
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "ALM31 Assistant",
        sections: "Getting Started / Configuration / Device Description / Harmonic Mode / Transient Mode / Waveform Mode / Trend Mode / Power and Energy Mode / Screen Snapshot Mode / Help Key / Data Export Software / General Specifications / Alarm Mode",
        model: MODEL_NAME
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log("==============================================");
    console.log("ALM31 Assistant server running");
    console.log(`Port: ${PORT}`);
    console.log(`Model: ${MODEL_NAME}`);
    console.log("Sections: Getting Started, Configuration, Device Description, Harmonic Mode, Transient Mode, Waveform Mode, Trend Mode, Power and Energy Mode, Screen Snapshot Mode, Help Key, Data Export Software, General Specifications, Alarm Mode");
    console.log("==============================================");
    console.log('ALM31 Assistant is ready to answer questions. Ask your question in english or select a language from the dropdown.')
});
