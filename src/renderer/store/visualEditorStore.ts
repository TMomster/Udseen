import { create } from 'zustand'
import type { VisualBlock, BlockConnection, VisualCanvasState } from '../../types/visualBlocks'

interface VisualEditorState {
  canvas: VisualCanvasState
  visualMode: boolean
  selectedBlockId: string | null
  selectedConnectionId: string | null
  codeSnapshot: string
  useChineseLabel: boolean

  // Actions
  setVisualMode: (mode: boolean) => void
  toggleVisualMode: () => void
  setBlocks: (blocks: VisualBlock[]) => void
  addBlock: (block: VisualBlock) => void
  updateBlock: (id: string, partial: Partial<VisualBlock>) => void
  removeBlock: (id: string) => void
  setConnections: (connections: BlockConnection[]) => void
  addConnection: (conn: BlockConnection) => void
  removeConnection: (id: string) => void
  selectBlock: (id: string | null) => void
  selectConnection: (id: string | null) => void
  moveBlockToIndex: (blockId: string, toIndex: number) => void
  clearCanvas: () => void
  takeCodeSnapshot: (code: string) => void
  setUseChineseLabel: (v: boolean) => void
}

const initialCanvas: VisualCanvasState = {
  blocks: [],
  connections: []
}

export const useVisualEditorStore = create<VisualEditorState>((set, get) => ({
  canvas: { ...initialCanvas },
  visualMode: false,
  selectedBlockId: null,
  selectedConnectionId: null,
  codeSnapshot: '',
  useChineseLabel: true,


  setVisualMode: (mode) => set({ visualMode: mode }),
  setUseChineseLabel: (v) => set({ useChineseLabel: v }),
  toggleVisualMode: () => set((state) => ({ visualMode: !state.visualMode })),

  setBlocks: (blocks) =>
    set((state) => ({
      canvas: { ...state.canvas, blocks }
    })),

  addBlock: (block) =>
    set((state) => {
      const newBlocks = [...state.canvas.blocks, block]

      // 将新块链接到顶层链的末尾，使其在 blocksToCode 时能被序列化
      const isChildBlock = state.canvas.blocks.some(
        (p) => p.childBlockIds.includes(block.id)
      )
      if (!isChildBlock && newBlocks.length > 1) {
        const newBlockId = block.id
        // 从后往前找最后一个 nextBlockId 为 null 的顶层块
        for (let i = newBlocks.length - 2; i >= 0; i--) {
          const b = newBlocks[i]
          const isTopLevel = !newBlocks.some((p) => p.childBlockIds.includes(b.id))
          if (isTopLevel && b.nextBlockId === null) {
            newBlocks[i] = { ...b, nextBlockId: newBlockId }
            break
          }
        }
      }

      return {
        canvas: {
          ...state.canvas,
          blocks: newBlocks
        }
      }
    }),

  updateBlock: (id, partial) =>
    set((state) => ({
      canvas: {
        ...state.canvas,
        blocks: state.canvas.blocks.map((b) =>
          b.id === id ? { ...b, ...partial } : b
        )
      }
    })),

  removeBlock: (id) =>
    set((state) => ({
      canvas: {
        ...state.canvas,
        blocks: state.canvas.blocks.filter((b) => b.id !== id),
        connections: state.canvas.connections.filter(
          (c) => c.fromBlockId !== id && c.toBlockId !== id
        )
      },
      selectedBlockId: state.selectedBlockId === id ? null : state.selectedBlockId
    })),

  setConnections: (connections) =>
    set((state) => ({
      canvas: { ...state.canvas, connections }
    })),

  addConnection: (conn) =>
    set((state) => ({
      canvas: {
        ...state.canvas,
        connections: [...state.canvas.connections, conn]
      }
    })),

  removeConnection: (id) =>
    set((state) => ({
      canvas: {
        ...state.canvas,
        connections: state.canvas.connections.filter((c) => c.id !== id)
      },
      selectedConnectionId: state.selectedConnectionId === id ? null : state.selectedConnectionId
    })),

  selectBlock: (id) => set({ selectedBlockId: id, selectedConnectionId: null }),
  selectConnection: (id) => set({ selectedConnectionId: id, selectedBlockId: null }),

  /** 将块移动到数组中的指定索引位置（仅顶层块），并重建 nextBlockId 链 */
  moveBlockToIndex: (blockId, toIndex) => {
    const state = get()
    const blocks = [...state.canvas.blocks]
    const fromIndex = blocks.findIndex((b) => b.id === blockId)
    if (fromIndex === -1) return

    const [block] = blocks.splice(fromIndex, 1)
    // 调整 toIndex（因为删除了一个元素）
    const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex
    blocks.splice(adjustedTo, 0, block)

    // 重建 nextBlockId 链：按数组顺序连接顶层块
    const topLevelIds = new Set(
      blocks.filter((b) => !blocks.some((p) => p.childBlockIds.includes(b.id))).map((b) => b.id)
    )
    const updatedBlocks = blocks.map((b, i) => {
      // 只更新顶层块的 nextBlockId
      if (!topLevelIds.has(b.id)) return b
      // 查找下一个也是顶层块的索引
      let nextId: string | null = null
      for (let j = i + 1; j < blocks.length; j++) {
        if (topLevelIds.has(blocks[j].id)) {
          nextId = blocks[j].id
          break
        }
      }
      return { ...b, nextBlockId: nextId }
    })

    set({ canvas: { ...state.canvas, blocks: updatedBlocks } })
  },

  clearCanvas: () => set({ canvas: { ...initialCanvas } }),

  takeCodeSnapshot: (code) => set({ codeSnapshot: code })
}))
