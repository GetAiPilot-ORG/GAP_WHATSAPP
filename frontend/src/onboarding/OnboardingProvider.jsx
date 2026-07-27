import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { startDriverTour } from './driverClient'
import { OnboardingContext } from './onboardingContext'
import { getGlobalTour, getTourForPath, GLOBAL_TOUR_ID, tours } from './tourRegistry'
import { clearAllTourStates, clearTourState, hasTourCompleted, setTourState } from './tourStorage'

export function OnboardingProvider({ children }) {
    const location = useLocation()
    const { user, userRole } = useAuth()
    const [isRunning, setIsRunning] = useState(false)
    const [activeTour, setActiveTour] = useState(null)

    const currentPageTour = useMemo(() => {
        const tour = getTourForPath(location.pathname)
        if (userRole !== 'owner' && tour?.id !== 'live-chat') return null
        return tour
    }, [location.pathname, userRole])

    const startTour = useCallback(async (tourIdOrTour, options = {}) => {
        const tour = typeof tourIdOrTour === 'string' ? tours[tourIdOrTour] : tourIdOrTour
        if (!tour || isRunning) return false

        setIsRunning(true)
        setActiveTour(tour.id)
        const started = await startDriverTour(tour, {
            onFinish: (status) => {
                if (options.remember !== false) {
                    setTourState(user, tour.id, status || 'completed')
                }
                setIsRunning(false)
                setActiveTour(null)
                options.onFinish?.(status)
            },
        })

        if (!started) {
            setIsRunning(false)
            setActiveTour(null)
        }
        return started
    }, [isRunning, user])

    const startCurrentPageTour = useCallback(() => {
        if (!currentPageTour) return false
        return startTour(currentPageTour, { remember: false })
    }, [currentPageTour, startTour])

    const startGlobalTour = useCallback(() => startTour(getGlobalTour(), { remember: true }), [startTour])

    const resetTour = useCallback((tourId) => {
        clearTourState(user, tourId)
    }, [user])

    const resetAllTours = useCallback(() => {
        clearAllTourStates(user)
    }, [user])

    useEffect(() => {
        if (!user || userRole !== 'owner' || isRunning) return
        if (hasTourCompleted(user, GLOBAL_TOUR_ID)) return

        const timer = window.setTimeout(() => {
            startGlobalTour()
        }, 900)

        return () => window.clearTimeout(timer)
    }, [isRunning, startGlobalTour, user, userRole])

    const value = useMemo(() => ({
        activeTour,
        currentPageTour,
        isRunning,
        startTour,
        startCurrentPageTour,
        startGlobalTour,
        resetTour,
        resetAllTours,
    }), [activeTour, currentPageTour, isRunning, resetAllTours, resetTour, startCurrentPageTour, startGlobalTour, startTour])

    return (
        <OnboardingContext.Provider value={value}>
            {children}
        </OnboardingContext.Provider>
    )
}
