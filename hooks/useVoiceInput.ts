import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseVoiceInputReturn {
  isListening: boolean;
  transcript: string;
  error: string | null;
  startListening: (lang?: string) => Promise<void>;
  stopListening: () => void;
}

export function useVoiceInput(
  onTranscript?: (text: string) => void,
): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const accumulatedRef = useRef('');

  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Handle speech recognition results
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    if (event.isFinal) {
      // Append final result to accumulated text
      accumulatedRef.current = accumulatedRef.current
        ? `${accumulatedRef.current} ${text}`
        : text;
      setTranscript(accumulatedRef.current);
      onTranscriptRef.current?.(accumulatedRef.current);
    } else {
      // Show interim results (accumulated + current partial)
      const display = accumulatedRef.current
        ? `${accumulatedRef.current} ${text}`
        : text;
      setTranscript(display);
      onTranscriptRef.current?.(display);
    }
  });

  // Handle errors
  useSpeechRecognitionEvent('error', (event) => {
    // Ignore no-speech errors — just means user was silent
    if (event.error === 'no-speech' || event.error === 'speech-timeout') {
      setIsListening(false);
      return;
    }
    setError(event.message || event.error || 'Unknown speech recognition error');
    setIsListening(false);
  });

  // Handle recognition end
  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  // Handle recognition start
  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
  });

  const startListening = useCallback(async (lang: string = 'en-US') => {
    try {
      setError(null);

      // Request permissions
      const { granted } =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        setError('Microphone permission is required for voice input');
        return;
      }

      // Reset accumulated text
      accumulatedRef.current = '';
      setTranscript('');

      // Start speech recognition
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to start voice input',
      );
    }
  }, []);

  const stopListening = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Ignore errors on stop
    }
    setIsListening(false);
  }, []);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
  };
}
