declare let addon: {
    getVersion: () => string;
    parseBinNet: () => any;
    decompressAndDecryptDb: (input: String, output: String, password: String) => {
        input: String;
        output: String;
        password: String;
        result: number;
    };
    decompressAndDecryptDb_V2: (input: String, output: String, password: String, onProgress: (db: String) => void) => {
        input: String;
        output: String;
        password: String;
        result: number;
    };
};
export = addon;
