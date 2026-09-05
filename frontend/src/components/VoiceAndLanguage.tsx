import React, { useState, useRef } from 'react';
import { Mic, Volume2, X } from 'lucide-react';

interface VoiceInputProps {
  language: 'en' | 'hi' | 'kn';
  onTranscript: (text: string) => void;
  placeholder?: string;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
  language,
  onTranscript,
  placeholder = 'Click mic to start speaking...'
}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('Speech Recognition not supported in this browser');
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    
    // Map language codes
    const langMap: { [key: string]: string } = {
      en: 'en-IN',
      hi: 'hi-IN',
      kn: 'kn-IN'
    };

    recognitionRef.current.lang = langMap[language] || 'en-IN';

    recognitionRef.current.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognitionRef.current.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptSegment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const nextTranscript = `${transcriptRef.current}${transcriptSegment} `;
          transcriptRef.current = nextTranscript;
          setTranscript(nextTranscript);
        } else {
          interim += transcriptSegment;
        }
      }
      if (interim) {
        console.log('Interim:', interim);
      }
    };

    recognitionRef.current.onerror = (event: any) => {
      setError(`Speech error: ${event.error}`);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
      const finalTranscript = transcriptRef.current.trim();
      if (finalTranscript) {
        onTranscript(finalTranscript);
      }
    };

    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleClear = () => {
    setTranscript('');
    transcriptRef.current = '';
    setError(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={isListening ? stopListening : startListening}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition ${
            isListening
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-cyan-600 hover:bg-cyan-700 text-white'
          }`}
        >
          <Mic size={18} />
          {isListening ? 'Stop Listening' : 'Start Voice Input'}
        </button>
        {transcript && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {error && (
        <div className="text-red-400 text-sm">{error}</div>
      )}

      {transcript && (
        <div className="bg-slate-800 border border-cyan-500/30 rounded-lg p-3">
          <p className="text-sm text-gray-300">
            <span className="text-cyan-400 font-semibold">Recognized:</span> {transcript}
          </p>
        </div>
      )}
    </div>
  );
};

interface TextToSpeechProps {
  text: string;
  language: 'en' | 'hi' | 'kn';
  autoPlay?: boolean;
}

export const TextToSpeech: React.FC<TextToSpeechProps> = ({
  text,
  language,
  autoPlay = false
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSpeak = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    
    const langMap: { [key: string]: string } = {
      en: 'en-IN',
      hi: 'hi-IN',
      kn: 'kn-IN'
    };

    utterance.lang = langMap[language] || 'en-IN';
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = (event) => {
      setError(`Speech error: ${event.error}`);
      setIsPlaying(false);
    };

    try {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      setError('Text-to-speech not supported');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSpeak}
        disabled={isPlaying || !text}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition ${
          isPlaying || !text
            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
        }`}
      >
        <Volume2 size={16} />
        {isPlaying ? 'Playing...' : 'Listen'}
      </button>
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </div>
  );
};

interface LanguageSwitcherProps {
  currentLanguage: 'en' | 'hi' | 'kn';
  onChange: (lang: 'en' | 'hi' | 'kn') => void;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  currentLanguage,
  onChange
}) => {
  return (
    <div className="flex gap-2">
      {(['en', 'hi', 'kn'] as const).map((lang) => (
        <button
          key={lang}
          onClick={() => onChange(lang)}
          className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
            currentLanguage === lang
              ? 'bg-cyan-600 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
          }`}
        >
          {lang === 'en' ? '🇬🇧 English' : lang === 'hi' ? '🇮🇳 हिंदी' : '🇮🇳 ಕನ್ನಡ'}
        </button>
      ))}
    </div>
  );
};
