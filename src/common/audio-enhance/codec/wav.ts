// WAV 文件头结构
interface WavHeader {
    riffChunkId: string; // "RIFF"
    riffChunkSize: number; // 文件大小 - 8
    riffFormat: string; // "WAVE"
    fmtChunkId: string; // "fmt "
    fmtChunkSize: number; // 16
    audioFormat: number; // 1 = PCM
    numChannels: number; // 声道数
    sampleRate: number; // 采样率
    byteRate: number; // 字节率 (SampleRate * NumChannels * BitsPerSample / 8)
    blockAlign: number; // 块对齐 (NumChannels * BitsPerSample / 8)
    bitsPerSample: number; // 采样位数
    dataChunkId: string; // "data"
    dataChunkSize: number; // 音频数据大小
}

export class WavEncoder {
    private header: WavHeader;
    private data: Buffer;
    private dataOffset: number;
    public bitsPerSample: number;

    constructor(sampleRate: number, numChannels: number, bitsPerSample: number) {
        if (![8, 16, 24, 32].includes(bitsPerSample)) {
            throw new Error("Unsupported bitsPerSample value. Must be 8, 16, 24, or 32.");
        }

        this.bitsPerSample = bitsPerSample;
        this.header = {
            riffChunkId: "RIFF",
            riffChunkSize: 0, // 待计算
            riffFormat: "WAVE",
            fmtChunkId: "fmt ",
            fmtChunkSize: 16,
            audioFormat: 1, // PCM
            numChannels: numChannels,
            sampleRate: sampleRate,
            byteRate: sampleRate * numChannels * bitsPerSample / 8,
            blockAlign: numChannels * bitsPerSample / 8,
            bitsPerSample: bitsPerSample,
            dataChunkId: "data",
            dataChunkSize: 0  // 待计算
        };
        this.data = Buffer.alloc(0);
        this.dataOffset = 0;
    }

    public write(buffer: Buffer): void {
        this.data = Buffer.concat([this.data, buffer]);
        this.dataOffset += buffer.length;
    }

    public encode(): Buffer {
        this.header.dataChunkSize = this.dataOffset;
        this.header.riffChunkSize = 36 + this.dataOffset;

        const headerBuffer = Buffer.alloc(44);

        headerBuffer.write(this.header.riffChunkId, 0, 4, 'ascii');
        headerBuffer.writeUInt32LE(this.header.riffChunkSize, 4);
        headerBuffer.write(this.header.riffFormat, 8, 4, 'ascii');
        headerBuffer.write(this.header.fmtChunkId, 12, 4, 'ascii');
        headerBuffer.writeUInt32LE(this.header.fmtChunkSize, 16);
        headerBuffer.writeUInt16LE(this.header.audioFormat, 20);
        headerBuffer.writeUInt16LE(this.header.numChannels, 22);
        headerBuffer.writeUInt32LE(this.header.sampleRate, 24);
        headerBuffer.writeUInt32LE(this.header.byteRate, 28);
        headerBuffer.writeUInt16LE(this.header.blockAlign, 32);
        headerBuffer.writeUInt16LE(this.header.bitsPerSample, 34);
        headerBuffer.write(this.header.dataChunkId, 36, 4, 'ascii');
        headerBuffer.writeUInt32LE(this.header.dataChunkSize, 40);

        return Buffer.concat([headerBuffer, this.data]);
    }
}

export class WavDecoder {
    private header: WavHeader;
    private data: Buffer;
    private dataOffset: number;
    public bitsPerSample: number;

    constructor(private buffer: Buffer) {
        this.header = {
            riffChunkId: "",
            riffChunkSize: 0,
            riffFormat: "",
            fmtChunkId: "",
            fmtChunkSize: 0,
            audioFormat: 0,
            numChannels: 0,
            sampleRate: 0,
            byteRate: 0,
            blockAlign: 0,
            bitsPerSample: 0,
            dataChunkId: "",
            dataChunkSize: 0
        };
        this.data = Buffer.alloc(0);
        this.dataOffset = 0;
        this.decodeHeader();
        this.decodeData();
        this.bitsPerSample = this.header.bitsPerSample;
    }

    private decodeHeader(): void {
        this.header.riffChunkId = this.buffer.toString('ascii', 0, 4);
        this.header.riffChunkSize = this.buffer.readUInt32LE(4);
        this.header.riffFormat = this.buffer.toString('ascii', 8, 4);
        this.header.fmtChunkId = this.buffer.toString('ascii', 12, 4);
        this.header.fmtChunkSize = this.buffer.readUInt32LE(16);
        this.header.audioFormat = this.buffer.readUInt16LE(20);
        this.header.numChannels = this.buffer.readUInt16LE(22);
        this.header.sampleRate = this.buffer.readUInt32LE(24);
        this.header.byteRate = this.buffer.readUInt32LE(28);
        this.header.blockAlign = this.buffer.readUInt16LE(32);
        this.header.bitsPerSample = this.buffer.readUInt16LE(34);
        this.header.dataChunkId = this.buffer.toString('ascii', 36, 4);
        this.header.dataChunkSize = this.buffer.readUInt32LE(40);

        this.dataOffset = 44;

        // 可以在此处添加对 header 值的校验
        if (this.header.riffChunkId !== "RIFF" || this.header.riffFormat !== "WAVE") {
            throw new Error("Invalid WAV file format.");
        }

        if (![8, 16, 24, 32].includes(this.header.bitsPerSample)) {
            throw new Error(`Unsupported bitsPerSample: ${this.header.bitsPerSample}`);
        }
    }

    private decodeData(): void {
        this.data = this.buffer.slice(this.dataOffset, this.dataOffset + this.header.dataChunkSize);
    }

    public getHeader(): WavHeader {
        return this.header;
    }

    public getData(): Buffer {
        return this.data;
    }
}