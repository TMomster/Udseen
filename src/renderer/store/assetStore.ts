import { create } from 'zustand'

interface Asset {
  name: string
  path: string
  type: 'image' | 'audio'
  previewUrl?: string
}

interface AssetState {
  assets: Asset[]
  selectedAsset: string | null

  // Actions
  setAssets: (assets: Asset[]) => void
  addAsset: (asset: Asset) => void
  removeAsset: (path: string) => void
  selectAsset: (path: string | null) => void
}

export const useAssetStore = create<AssetState>((set) => ({
  assets: [],
  selectedAsset: null,

  setAssets: (assets) => set({ assets }),

  addAsset: (asset) =>
    set((state) => ({
      assets: [...state.assets, asset]
    })),

  removeAsset: (path) =>
    set((state) => ({
      assets: state.assets.filter((a) => a.path !== path)
    })),

  selectAsset: (selectedAsset) => set({ selectedAsset })
}))
