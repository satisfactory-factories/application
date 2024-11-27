export interface Part {
    name: string;
    stackSize: number;
    isFluid: boolean;
    isFicsmas: boolean;
    energyGeneratedInMJ: number;
}

export interface PartDataInterface {
    parts: { [key: string]: Part };
    collectables: { [key: string]: string };
    rawResources: { [key: string]: RawResource };
}

export interface RawResource {
    name: string;
    limit: number;
}