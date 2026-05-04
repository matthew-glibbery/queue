import { create } from 'zustand'
import type { Project } from '@shared/types'
import { supabase, rowToProject, projectToRow, type ProjectRow } from '../lib/supabase'
import { getDeviceId } from '../lib/deviceId'
import { MOCK_PROJECTS } from '../lib/mockData'

interface ProjectState {
  projects: Project[]
  activeProjectId: string | null
  initialized: boolean
  initialize: () => Promise<void>
  setActiveProject: (id: string | null) => void
  upsertProject: (project: Project) => Promise<void>
  removeProject: (id: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return

    if (!supabase) {
      set({ projects: MOCK_PROJECTS, activeProjectId: 'proj-1', initialized: true })
      return
    }

    const deviceId = getDeviceId()
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('device_id', deviceId)
      .order('name')

    const projects = data ? data.map((r) => rowToProject(r as ProjectRow)) : MOCK_PROJECTS
    set({ projects, activeProjectId: projects[0]?.id ?? null, initialized: true })

    supabase
      .channel('queue:projects')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: `device_id=eq.${deviceId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            set((state) => ({
              projects: [...state.projects, rowToProject(payload.new as ProjectRow)],
            }))
          } else if (payload.eventType === 'UPDATE') {
            set((state) => ({
              projects: state.projects.map((p) =>
                p.id === (payload.new as ProjectRow).id
                  ? rowToProject(payload.new as ProjectRow)
                  : p
              ),
            }))
          } else if (payload.eventType === 'DELETE') {
            set((state) => ({
              projects: state.projects.filter((p) => p.id !== (payload.old as ProjectRow).id),
            }))
          }
        }
      )
      .subscribe()
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  upsertProject: async (project) => {
    set((state) => {
      const exists = state.projects.some((p) => p.id === project.id)
      return {
        projects: exists
          ? state.projects.map((p) => (p.id === project.id ? project : p))
          : [...state.projects, project],
      }
    })
    if (supabase) {
      await supabase.from('projects').upsert(projectToRow(project, getDeviceId()))
    }
  },

  removeProject: async (id) => {
    set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }))
    if (supabase) {
      await supabase.from('projects').delete().eq('id', id)
    }
  },
}))
