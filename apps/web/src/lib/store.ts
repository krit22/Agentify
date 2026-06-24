import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  activeTicketId: string | null;
  toggleSidebar: () => void;
  selectTicket: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  activeTicketId: null,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  selectTicket: (id) => set({ activeTicketId: id }),
}));
