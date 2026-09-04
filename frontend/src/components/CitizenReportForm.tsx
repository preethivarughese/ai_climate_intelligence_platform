import React, { useState } from 'react';
import { Upload, Mic, AlertTriangle } from 'lucide-react';
import { VoiceInput, TextToSpeech } from './VoiceAndLanguage';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { apiUrl } from '../api';
import { storage } from '../services/firebase';

interface PollutionReport {
  title: string;
  description: string;
  location: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  imageUrl?: string;
}

interface CitizenReportFormProps {
  language: 'en' | 'hi' | 'kn';
  latitude?: number;
  longitude?: number;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'low': return 'bg-yellow-500/20 border-yellow-500 text-yellow-300';
    case 'medium': return 'bg-orange-500/20 border-orange-500 text-orange-300';
    case 'high': return 'bg-red-500/20 border-red-500 text-red-300';
    case 'critical': return 'bg-red-700/20 border-red-700 text-red-200';
    default: return 'bg-gray-500/20 border-gray-500 text-gray-300';
  }
};

export const CitizenReportForm: React.FC<CitizenReportFormProps> = ({ language, latitude, longitude }) => {
  const { user, userProfile } = useAuth();
  const [formData, setFormData] = useState<PollutionReport>({
    title: '',
    description: '',
    location: '',
    severity: 'medium',
  });

  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translations = {
    en: {
      title: 'Report a Pollution Event',
      subtitle: 'Help us detect and track pollution hotspots',
      name: 'Your Name',
      location: 'Location (City/Area)',
      description: 'Describe what you observe',
      severity: 'Severity Level',
      image: 'Upload Photo',
      submit: 'Submit Report',
      submitting: 'Submitting...',
      submitted: 'Report submitted successfully!',
      low: 'Minor (dust, smoke)',
      medium: 'Moderate (visible haze)',
      high: 'Severe (strong smell, poor visibility)',
      critical: 'Critical (emergency level)',
    },
    hi: {
      title: 'प्रदूषण घटना की रिपोर्ट करें',
      subtitle: 'हमें प्रदूषण को ट्रैक करने में मदद करें',
      name: 'आपका नाम',
      location: 'स्थान (शहर/क्षेत्र)',
      description: 'जो आप देख रहे हैं उसका विवरण दें',
      severity: 'गंभीरता का स्तर',
      image: 'फोटो अपलोड करें',
      submit: 'रिपोर्ट जमा करें',
      submitting: 'जमा किया जा रहा है...',
      submitted: 'रिपोर्ट सफलतापूर्वक जमा हो गई!',
      low: 'कम (धूल, धुआं)',
      medium: 'मध्यम (दिखाई देने वाली धुंध)',
      high: 'गंभीर (तीव्र गंध, कम दृश्यता)',
      critical: 'बहुत गंभीर (आपातकालीन स्तर)',
    },
    kn: {
      title: 'ಪ್ರದೂಷಣ ಘಟನೆ ವರದಿ ಮಾಡಿ',
      subtitle: 'ಮಾಲಿನ್ಯ ಪತ್ತೆಹಚ್ಚಲು ನಮಗೆ ಸಹಾಯ ಮಾಡಿ',
      name: 'ನಿಮ್ಮ ಹೆಸರು',
      location: 'ಸ್ಥಳ (ನಗರ/ಪ್ರದೇಶ)',
      description: 'ನೀವು ಕಾಣುತ್ತಿರುವುದನ್ನು ವರ್ಣಿಸಿ',
      severity: 'ತೀವ್ರತೆಯ ಮಟ್ಟ',
      image: 'ಫೋಟೋ ಅಪ್ಲೋಡ್ ಮಾಡಿ',
      submit: 'ವರದಿ ಸಲ್ಲಿಸಿ',
      submitting: 'ಸಲ್ಲಿಸಲಾಗುತ್ತಿದೆ...',
      submitted: 'ವರದಿ ಯಶಸ್ವಿಯಾಗಿ ಸಲ್ಲಿಸಲಾಗಿದೆ!',
      low: 'ಕಡಿಮೆ (ಧೂಳು, ಹೊಗೆ)',
      medium: 'ಮಧ್ಯಮ (ಗೋಚರ ಮೋಡ)',
      high: 'ತೀವ್ರ (ಬಲವಾದ ವಾಸನೆ, ಕಡಿಮೆ ದೃಶ್ಯತೆ)',
      critical: 'ಬಹಳ ತೀವ್ರ (ತುರ್ತುಗತಿ ಮಟ್ಟ)',
    }
  };

  const t = translations[language as keyof typeof translations];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleVoiceInput = (transcript: string) => {
    setFormData((prev) => ({
      ...prev,
      description: prev.description + (prev.description ? ' ' : '') + transcript,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !userProfile) {
      setError('Please log in to submit a report');
      return;
    }

    if (!formData.title.trim() || !formData.location.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let imageAnalysis = null;
      let imageUrl = null;
      if (uploadedImage) {
        const imageForm = new FormData();
        imageForm.append('file', uploadedImage);
        if (latitude !== undefined && longitude !== undefined) {
          imageForm.append('lat', String(latitude));
          imageForm.append('lon', String(longitude));
        }
        const analysisResponse = await fetch(apiUrl('/api/images/analyze'), {
          method: 'POST',
          body: imageForm,
        });
        imageAnalysis = await analysisResponse.json();
        if (!analysisResponse.ok) {
          throw new Error(imageAnalysis?.detail || 'Image analysis failed');
        }

        const safeFileName = uploadedImage.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const imageRef = ref(storage, `pollution-reports/${user.uid}/${Date.now()}-${safeFileName}`);
        const uploadResult = await uploadBytes(imageRef, uploadedImage, {
          contentType: uploadedImage.type,
        });
        imageUrl = await getDownloadURL(uploadResult.ref);
      }

      const reportData = {
        ...formData,
        userId: user.uid,
        userName: userProfile.displayName,
        userCity: userProfile.city,
        userState: userProfile.state,
        timestamp: serverTimestamp(),
        image: imageUrl,
        imageAnalysis,
      };

      await addDoc(collection(db, 'pollution_reports'), reportData);
      setSubmitted(true);
      setFormData({
        title: '',
        description: '',
        location: '',
        severity: 'medium',
      });
      setUploadedImage(null);
      setImagePreview(null);

      setTimeout(() => setSubmitted(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800/50 border border-cyan-500/30 rounded-lg p-6 space-y-4 max-w-2xl">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="text-cyan-400" size={24} />
            {t.title}
          </h2>
          <p className="text-gray-400 text-sm mt-1">{t.subtitle}</p>
        </div>
      </div>

      {submitted && (
        <div className="bg-green-500/20 border border-green-500 text-green-300 p-4 rounded-lg">
          ✓ {t.submitted}
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-lg">
          ✗ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">Title *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., Dust storm near highway"
            className="w-full bg-slate-900 border border-cyan-500/30 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
            required
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">{t.location} *</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
            placeholder="Enter city or area"
            className="w-full bg-slate-900 border border-cyan-500/30 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
            required
          />
        </div>

        {/* Description with Voice Input */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">{t.description}</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Describe the pollution event..."
            className="w-full bg-slate-900 border border-cyan-500/30 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 min-h-24 resize-none"
          />
          <VoiceInput
            language={language}
            onTranscript={handleVoiceInput}
            placeholder={`Speak in ${language === 'hi' ? 'Hindi' : language === 'kn' ? 'Kannada' : 'English'}...`}
          />
        </div>

        {/* Severity */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">{t.severity}</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(['low', 'medium', 'high', 'critical'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, severity: level }))}
                className={`px-3 py-2 rounded border transition text-sm font-semibold ${
                  formData.severity === level
                    ? getSeverityColor(level)
                    : 'bg-slate-700 border-slate-600 text-gray-300 hover:bg-slate-600'
                }`}
              >
                {t[level as keyof typeof t]}
              </button>
            ))}
          </div>
        </div>

        {/* Image Upload */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">{t.image}</label>
          <div className="flex items-center gap-3">
            <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer flex items-center gap-2 transition">
              <Upload size={18} />
              Choose Image
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
            {uploadedImage && <span className="text-green-400 text-sm">✓ {uploadedImage.name}</span>}
          </div>
          {imagePreview && (
            <img src={imagePreview} alt="Preview" className="w-full max-w-xs rounded mt-2 border border-cyan-500/30" />
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 rounded transition disabled:opacity-50"
        >
          {loading ? t.submitting : t.submit}
        </button>
      </form>
    </div>
  );
};
