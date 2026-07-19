import mongoose from "mongoose";

const FactoryTabSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, index: true },
    tabId: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastSaved: { type: Date, default: Date.now },
  },
  { minimize: false }
);
FactoryTabSchema.index({ user: 1, tabId: 1 }, { unique: true });

export const FactoryTabData = mongoose.model('FactoryTabData', FactoryTabSchema);
