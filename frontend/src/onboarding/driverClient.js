let activeDriver = null

function resolveElement(selector) {
    if (!selector || typeof document === 'undefined') return null
    const selectors = String(selector).split(',').map(item => item.trim()).filter(Boolean)
    for (const item of selectors) {
        const element = document.querySelector(item)
        if (isUsableElement(element)) return item
    }
    return null
}

function isUsableElement(element) {
    if (!element) return false
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
}

function getMobileSafePopover(popover = {}) {
    if (typeof window === 'undefined' || window.innerWidth > 767) return popover
    return {
        ...popover,
        side: 'bottom',
        align: 'center',
    }
}

function normalizeSteps(steps = []) {
    return steps
        .map(item => {
            const element = resolveElement(item.element)
            if (!element) return null
            return {
                ...item,
                element,
                popover: getMobileSafePopover(item.popover),
            }
        })
        .filter(Boolean)
}

export async function startDriverTour(tour, options = {}) {
    if (!tour?.steps?.length || typeof window === 'undefined') return false
    const steps = normalizeSteps(tour.steps)
    if (!steps.length) return false

    if (activeDriver) {
        activeDriver.destroy()
        activeDriver = null
    }

    const [{ driver }] = await Promise.all([
        import('driver.js'),
        import('driver.js/dist/driver.css'),
    ])

    activeDriver = driver({
        showProgress: steps.length > 1,
        animate: false,
        allowClose: true,
        overlayOpacity: 0.55,
        stagePadding: window.innerWidth < 768 ? 6 : 10,
        popoverClass: 'gap-driver-popover',
        nextBtnText: tour.nextBtnText || 'Next',
        prevBtnText: tour.prevBtnText || 'Back',
        doneBtnText: tour.doneBtnText || 'Done',
        steps,
        onDestroyed: () => {
            options.onFinish?.('dismissed')
            activeDriver = null
        },
    })

    activeDriver.drive()
    return true
}

export function stopDriverTour() {
    if (!activeDriver) return
    activeDriver.destroy()
    activeDriver = null
}
