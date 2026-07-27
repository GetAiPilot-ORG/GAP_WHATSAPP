import { createContext, useContext } from 'react'

export const OnboardingContext = createContext(null)

export function useOnboarding() {
    const context = useContext(OnboardingContext)
    if (!context) {
        return {
            activeTour: null,
            currentPageTour: null,
            isRunning: false,
            startTour: async () => false,
            startCurrentPageTour: async () => false,
            startGlobalTour: async () => false,
            resetTour: () => {},
            resetAllTours: () => {},
        }
    }
    return context
}
