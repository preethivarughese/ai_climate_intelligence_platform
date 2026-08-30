# Voice Input Feature - Complete Guide

## WHERE VOICE IS USED

### 1. **Citizen Reporting Form** (Primary Use)
**File**: [frontend/src/components/CitizenReportForm.tsx](frontend/src/components/CitizenReportForm.tsx)

**Context**: When citizens report a pollution event, they fill a form with:
- Title (text input)
- Location (text input)
- **Description (textarea + Voice Input)** ← Voice happens here
- Severity level (buttons)
- Photo upload (optional)

**How It Works**:
```tsx
// Line 107-111 in CitizenReportForm.tsx
const handleVoiceInput = (transcript: string) => {
  setFormData((prev) => ({
    ...prev,
    // Append voice transcript to description
    description: prev.description + (prev.description ? ' ' : '') + transcript,
  }));
};

// Lines 221-224: VoiceInput component rendered
<VoiceInput
  language={language_state}
  onTranscript={handleVoiceInput}
  placeholder={`Speak in ${language_state === 'hi' ? 'Hindi' : language_state === 'kn' ? 'Kannada' : 'English'}...`}
/>
```

### 2. **Voice Component Architecture**
**File**: [frontend/src/components/VoiceAndLanguage.tsx](frontend/src/components/VoiceAndLanguage.tsx)

**What It Contains**:
1. **`VoiceInput` Component** - Speech-to-text capture
2. **`TextToSpeech` Component** - Unused (placeholder for alerts read aloud)
3. **`LanguageSwitcher` Component** - Toggle between EN/HI/KN

#### **VoiceInput Capabilities**:

| Feature | Details |
|---------|---------|
| **Languages** | English (en-IN), Hindi (hi-IN), Kannada (kn-IN) |
| **API** | Browser's native Web Speech API (SpeechRecognition) |
| **Mode** | Continuous listening with interim results |
| **Output** | Text transcript appended to form |
| **Error Handling** | Browser compatibility check, error messages |
| **Browser Support** | Chrome, Edge, Firefox, Safari |

### 3. **Language Selection UI**
**File**: [frontend/src/components/VoiceAndLanguage.tsx](frontend/src/components/VoiceAndLanguage.tsx), Lines 100+

**Component**: `LanguageSwitcher`
```tsx
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  currentLanguage,
  onChange
}) => (
  <select
    value={currentLanguage}
    onChange={(e) => onChange(e.target.value as 'en' | 'hi' | 'kn')}
    className="..."
  >
    <option value="en">English</option>
    <option value="hi">हिंदी (Hindi)</option>
    <option value="kn">ಕನ್ನಡ (Kannada)</option>
  </select>
);
```

---

## HOW TO USE VOICE INPUT (User Perspective)

### **Step-by-Step on Frontend**

1. **Go to Citizen Reporting Page**
   - Navigate to "Report Pollution Event" section
   - See the language selector (top right of form)

2. **Select Language**
   - Click dropdown, choose: English / हिंदी / ಕನ್ನಡ
   - Entire UI updates to selected language

3. **Fill Form Fields**
   - **Title**: Enter pollution event name (text only, e.g., "Heavy smoke near market")
   - **Location**: Enter city/area (text only)
   - **Severity**: Click one of 4 buttons (Low/Medium/High/Critical)
   - **Photo**: Optional, click to upload

4. **Use Voice for Description**
   - Look for the **microphone button** below the Description textarea
   - Click the mic icon (red circle while listening)
   - **Speak naturally** in your chosen language:
     - English: "There is heavy smoke and bad visibility in my area"
     - Hindi: "मेरे इलाके में बहुत धुआं है और दृश्यता खराब है"
     - Kannada: "ನನ್ನ ಪ್ರದೇಶದಲ್ಲಿ ಹೆಚ್ಚಿನ ಹೊಗೆ ಮತ್ತು ಹೆಚ್ಚಿನ ಪರಿವರ್ತನೆ ಇದೆ"
   - Your speech is transcribed in real-time
   - Click **Stop** (or wait for silence)
   - Transcript appears in the description field
   - **Can repeat multiple times**—each voice input is appended

5. **Optional: Photo Upload for Gemini Analysis**
   - Click "Upload Photo"
   - Take or select a photo showing pollution
   - Gemini Vision API analyzes it (backend)
   - Result stored with report

6. **Submit Report**
   - Click "Submit Report"
   - Report saved to Firestore with:
     - User ID, location, timestamp
     - Voice-transcribed description
     - Photo (if uploaded) + Gemini analysis
     - Severity level
     - GPS coordinates (if browser permits)

---

## TECHNICAL DETAILS

### **Voice Input Component Flow**

```
User clicks Mic button
    ↓
Browser asks for microphone permission
    ↓
Web Speech API starts listening (lang = en-IN / hi-IN / kn-IN)
    ↓
User speaks
    ↓
Browser transcribes in real-time (interim results shown)
    ↓
User stops speaking (or browser detects silence)
    ↓
Final transcript sent via onTranscript callback
    ↓
handleVoiceInput() in CitizenReportForm appends to description state
    ↓
Form field updates with voice text
```

### **Error Handling**

If browser doesn't support Web Speech API:
```
Error: "Speech Recognition not supported in this browser"
```

Common errors users might see:
- "No speech detected" → User needs to speak louder or slower
- "Network error" → Browser's internet connection issue
- "Permission denied" → User blocked microphone access (need to reset browser settings)

### **Language Mapping** (from VoiceAndLanguage.tsx)

```tsx
const langMap: { [key: string]: string } = {
  en: 'en-IN',    // English - India
  hi: 'hi-IN',    // Hindi - India
  kn: 'kn-IN'     // Kannada - India
};
```

These are standard BCP 47 language tags recognized by Web Speech API.

---

## DATA FLOW: Voice Input → Backend → Storage

```
1. Frontend: User speaks → VoiceInput captures transcript
   └─ "Heavy smoke near IT Park"

2. Frontend: handleVoiceInput() appends to form
   └─ formData.description = "Heavy smoke near IT Park"

3. User clicks "Submit Report"
   └─ POST to /api endpoint (not currently using voice, but could)

4. Backend receives:
   └─ {
        title: "Pollution Event",
        location: "Bangalore",
        description: "Heavy smoke near IT Park",
        severity: "high",
        userId: "user_123",
        timestamp: "2024-08-30T10:30:00Z"
      }

5. Backend stores in Firestore:
   └─ Collection: pollution_reports
      Document ID: auto-generated
      Fields: title, location, description (with voice transcript), 
              severity, userId, timestamp, image (if uploaded)

6. Optional: Backend analyzes voice description with Gemini
   └─ Could extract "smoke near IT Park" → pollution type classification
   └─ Could trigger alert if severity is high
```

---

## MULTILINGUAL UI (Complete i18n)

**File**: [frontend/src/i18n/translations.ts](frontend/src/i18n/translations.ts)

The entire form is localized:

```tsx
const translations = {
  en: {
    title: 'Report a Pollution Event',
    description: 'Describe what you observe',
    submit: 'Submit Report',
    // ... more translations
  },
  hi: {
    title: 'प्रदूषण घटना की रिपोर्ट करें',
    description: 'जो आप देख रहे हैं उसका विवरण दें',
    submit: 'रिपोर्ट जमा करें',
    // ... more translations
  },
  kn: {
    title: 'ಪ್ರದೂಷಣ ಘಟನೆ ವರದಿ ಮಾಡಿ',
    description: 'ನೀವು ಕಾಣುತ್ತಿರುವುದನ್ನು ವರ್ಣಿಸಿ',
    submit: 'ವರದಿ ಸಲ್ಲಿಸಿ',
    // ... more translations
  }
};
```

So when user selects "हिंदी", entire form switches to Hindi:
- Labels → Hindi
- Placeholders → Hindi
- Voice input language → hi-IN (Hindi recognition)
- Button text → Hindi
- Error messages → Hindi

---

## VOICE INPUT IN VIDEO DEMO

**In your 5-minute demo video, showcase this flow:**

1. (0:15-0:45) **Login & Language Selection**
   - Log in as citizen
   - Click language dropdown
   - Show UI switching to Hindi

2. (0:45-1:00) **Voice Input in Action**
   - Navigate to "Report Pollution"
   - Show form fields
   - Click mic button
   - **Speak in Hindi**: "मेरे इलाके में आग लगी है और बहुत धुआं है"
   - Show real-time transcript appearing
   - Show text being appended to description field

3. (1:00-1:15) **Photo Upload**
   - Upload a photo of pollution/smoke
   - Show Gemini analysis happening (backend processing)

4. (1:15-1:30) **Submit & Show in Authority Dashboard**
   - Click Submit
   - Switch to Authority view
   - Show the report now appears in their queue
   - Show they can see: voice transcript, photo analysis, citizen's multilingual description

---

## WHY VOICE INPUT MATTERS (For Competition Submission)

✅ **Inclusion**: Not everyone can read/type (rural India, informal sectors)
✅ **Speed**: Faster to speak than type on mobile
✅ **Multilingual**: Solves regional language barrier
✅ **Accessibility**: PWD-friendly (audio input for visually impaired to contribute)
✅ **Demonstrates Google AI Integration**: Uses browser's speech-to-text (future: could use Cloud Speech-to-Text API for higher accuracy)

**Judge's Perspective**: "They're not building for urban, English-educated users. They built for India as it is."

---

## TESTING VOICE INPUT LOCALLY

```bash
# 1. Start frontend dev server
cd frontend
npm run dev

# 2. Open browser: http://localhost:5173
# 3. Create test account or log in
# 4. Navigate to "Report Pollution"
# 5. Select language (try English, then Hindi, then Kannada)
# 6. Click mic button
# 7. Speak: "Test message in [language]"
# 8. Verify transcript appears in description field
# 9. Submit form
# 10. Check Firestore to see stored report with voice transcript
```

---

## KNOWN LIMITATIONS & FUTURE ENHANCEMENTS

| Current | Future |
|---------|--------|
| Web Speech API (browser-dependent) | Upgrade to Google Cloud Speech-to-Text API for higher accuracy |
| 3 languages (EN/HI/KN) | Expand to 10+ Indian languages (Tamil, Telugu, Bengali, Marathi, etc.) |
| Voice → Text only | Add voice synthesis for authority alerts read aloud (TextToSpeech component ready) |
| Single device capture | Support WhatsApp/Telegram bot integration for voice reports via messaging apps |
| No speaker identification | Add voice-based identity verification (future: voice biometrics) |

---

## QUICK REFERENCE

**Where to Find Voice Code**:
- Component: `/frontend/src/components/VoiceAndLanguage.tsx`
- Usage: `/frontend/src/components/CitizenReportForm.tsx` (line 107, 221)
- Translations: `/frontend/src/i18n/translations.ts`

**To Demo Voice in Video**:
1. Select language (Hindi recommended for impact)
2. Click microphone in description field
3. Speak naturally in that language
4. Show transcript appearing in real-time
5. Submit form

**Key Points for Judges**:
- "Voice input removes literacy barrier"
- "Multilingual support = inclusive climate action"
- "Real-time transcription happens client-side; can integrate Gemini for intent classification"

