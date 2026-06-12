/** Web Serial API（Chrome/Edge）；本机硬件配置用，非业务数据 */
interface SerialPort {
  readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

interface Serial extends EventTarget {
  requestPort(): Promise<SerialPort>;
}

interface Navigator {
  serial?: Serial;
}
