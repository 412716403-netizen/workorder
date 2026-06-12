import { useCallback, useEffect, useRef, useState } from 'react';
import { parseScaleLine, type ScaleInputProtocol } from '../utils/parseScaleInput';

const STORAGE_KEY = 'smarttrack.serialScale.config';

export type SerialScaleProtocol = ScaleInputProtocol;

export interface SerialScaleConfig {
  baudRate: number;
  protocol: SerialScaleProtocol;
}

const DEFAULT_CONFIG: SerialScaleConfig = {
  baudRate: 9600,
  protocol: 'auto',
};

export type SerialScaleStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'unsupported';

export interface SerialScaleReading {
  weightKg: number;
  stable: boolean;
  rawLine: string;
}

export { parseScaleLine };

function loadConfig(): SerialScaleConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SerialScaleConfig>;
    return {
      baudRate: parsed.baudRate && parsed.baudRate > 0 ? parsed.baudRate : DEFAULT_CONFIG.baudRate,
      protocol: parsed.protocol ?? DEFAULT_CONFIG.protocol,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: SerialScaleConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function useSerialScale() {
  const [config, setConfigState] = useState<SerialScaleConfig>(() => loadConfig());
  const [status, setStatus] = useState<SerialScaleStatus>(() =>
    isWebSerialSupported() ? 'disconnected' : 'unsupported',
  );
  const [reading, setReading] = useState<SerialScaleReading | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef('');
  const configRef = useRef(config);
  configRef.current = config;

  const setConfig = useCallback((next: Partial<SerialScaleConfig>) => {
    setConfigState(prev => {
      const merged = { ...prev, ...next };
      saveConfig(merged);
      return merged;
    });
  }, []);

  const disconnect = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    try {
      await readerRef.current?.cancel();
    } catch {
      /* ignore */
    }
    readerRef.current = null;
    try {
      await portRef.current?.close();
    } catch {
      /* ignore */
    }
    portRef.current = null;
    setStatus(isWebSerialSupported() ? 'disconnected' : 'unsupported');
    setErrorMessage(null);
  }, []);

  const readLoop = useCallback(async (port: SerialPort, signal: AbortSignal) => {
    if (!port.readable) return;
    const reader = port.readable.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();
    try {
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        bufferRef.current += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = bufferRef.current.search(/[\r\n]/)) >= 0) {
          const line = bufferRef.current.slice(0, idx);
          bufferRef.current = bufferRef.current.slice(idx + 1).replace(/^\r/, '');
          const parsed = parseScaleLine(line, configRef.current.protocol);
          if (parsed) setReading(parsed);
        }
      }
    } catch (e) {
      if (!signal.aborted) {
        setStatus('error');
        setErrorMessage((e as Error)?.message || '读取串口失败');
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
      readerRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!isWebSerialSupported()) {
      setStatus('unsupported');
      setErrorMessage('当前浏览器不支持 Web Serial，请使用 Chrome 或 Edge');
      return;
    }
    setStatus('connecting');
    setErrorMessage(null);
    try {
      await disconnect();
      const port = await navigator.serial!.requestPort();
      await port.open({ baudRate: configRef.current.baudRate });
      portRef.current = port;
      const ac = new AbortController();
      abortRef.current = ac;
      setStatus('connected');
      void readLoop(port, ac.signal);
    } catch (e) {
      setStatus('error');
      setErrorMessage((e as Error)?.message || '连接电子秤失败');
    }
  }, [disconnect, readLoop]);

  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  const snapshotWeightKg = useCallback((): number | null => {
    const w = reading?.weightKg;
    if (w == null || !Number.isFinite(w) || w <= 0) return null;
    return w;
  }, [reading]);

  return {
    config,
    setConfig,
    status,
    reading,
    errorMessage,
    isSupported: isWebSerialSupported(),
    isConnected: status === 'connected',
    isStable: reading?.stable ?? false,
    currentWeightKg: reading?.weightKg ?? null,
    connect,
    disconnect,
    snapshotWeightKg,
  };
}
