export interface ParserPart {
    name: string;
    stackSize: number;
    isFluid: boolean;
    isFicsmas: boolean;
    energyGeneratedInMJ: number;
}

export interface ParserItemDataInterface {
    parts: { [key: string]: ParserPart };
    collectables: { [key: string]: string };
    rawResources: { [key: string]: ParserRawResource };
}

export interface ParserRawResource {
    name: string;
    limit: number;
}