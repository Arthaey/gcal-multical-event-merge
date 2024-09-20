// ==UserScript==
// @name        Cal Merge for Google Calendar™ (by @HCAWN forked from @imightbeAmy)
// @namespace   gcal-multical-event-merge
// @include     https://www.google.com/calendar/*
// @include     http://www.google.com/calendar/*
// @include     https://calendar.google.com/*
// @include     http://calendar.google.com/*
// @version     1
// @grant       none
// ==/UserScript==

"use strict"

const fillOptions = {
    candy_cane: new_colors => {
        const width = 10
        const angle = 45
        let gradient = `repeating-linear-gradient( ${angle}deg,`
        let pos = 0

        const colors = new_colors.map(c => c.bg || c.bc || c.pbc)

        const colorCounts = colors.reduce((counts, color) => {
            counts[color] = (counts[color] || 0) + 1
            return counts
        }, {})

        colors.forEach((color, i) => {
            colorCounts[color] -= 1
            color = chroma(color)
                .darken(colorCounts[color] / 3)
                .css()

            gradient += color + " " + pos + "px,"
            pos += width
            gradient += color + " " + pos + "px,"
        })
        gradient = gradient.slice(0, -1)
        gradient += ")"
        return gradient
    },
    vertical_bands: colors => {
        let gradient = `linear-gradient( 90deg,`
        let pos = 0
        const width = 100 / colors.length

        colors.forEach((colorObj, i) => {
            pos += width
            if (colorObj.bg) {
                gradient += colorObj.bg + " 0%" + pos + "%,"
            } else if (colorObj.bc) {
                // if border set then zebra segment to simulate border and text
                const colorBrighter = chroma(colorObj.bc).brighten().css()
                const fifth = width / 5
                gradient += `${colorObj.bc} 0% ${pos - width + fifth}%,
        ${colorBrighter} 0% ${pos - width + 2 * fifth}%,
        ${colorObj.bc} 0% ${pos - width + 3 * fifth}%,
        ${colorBrighter} 0% ${pos - width + 4 * fifth}%,
        ${colorObj.bc} 0% ${pos}%,`
            } else {
                gradient += colorObj.pbc + " 0%" + pos + "%,"
            }
        })
        gradient = gradient.slice(0, -1)
        gradient += ")"
        return gradient
    },
    smooth_vertical_bands: new_colors => {
        let gradient = `linear-gradient( to right,`
        const colors = new_colors.map(c => c.bg || c.bc || c.pbc)

        colors.forEach(color => {
            gradient += color + ","
        })
        gradient = gradient.slice(0, -1)
        gradient += ")"
        return gradient
    },
    vertical_bands_fade_merge: new_colors => {
        let gradient = `linear-gradient( to right,`
        const colors = new_colors.map(c => c.bg || c.bc || c.pbc)

        colors.forEach(color => {
            // each colour spreads more (hack, but this extension isn't exactly meant to be optimised)
            gradient += color + "," + color + "," + color + ","
        })
        gradient = gradient.slice(0, -1)
        gradient += ")"
        return gradient
    }
}

const dragType = e => parseInt(e.dataset.dragsourceType)

const calculatePosition = (event, parentPosition) => {
    const eventPosition = event.getBoundingClientRect()
    return {
        left: Math.max(eventPosition.left - parentPosition.left, 0),
        right: parentPosition.right - eventPosition.right,
        parentWidth: parentPosition.width
    }
}

const mergeEventElements = async events => {
    const getStyle = () => new Promise(res => chrome.storage.local.get("style", s => res(s.style)))
    const fill_style = await getStyle() ?? 'candy_cane'
    // disabling this as it changes the orders of the events making clicking on the now transparent divs not be in the correct order
    // events.sort((e1, e2) => dragType(e1) - dragType(e2));
    const colors = events.map(event => {
        return {
            bg: event.style.backgroundColor, // Week day and full day events marked 'attending'
            bc: event.style.borderColor, // Not attending or not responded week view events
            pbc: event.parentElement.style.borderColor // Timed month view events
        }
    })

    const parentPosition = events[0].parentElement.getBoundingClientRect()
    const positions = events.map(event => {
        event.originalPosition = event.originalPosition || calculatePosition(event, parentPosition)
        return event.originalPosition
    })

    events.forEach((event, i) => {
        // if top of all day event then handle
        if (i === 0 && event.parentElement.style.top === "0em") {
            // TODO Why did I add this in the first place? Looks like it just caused problems
            // event.parentElement.style.position = "absolute"
            // event.parentElement.style.width = "100%"
        }
    })

    // section to account for multiple events at the same time
    // of the original events, find the position they occupy relative to parent
    // leftPercent and widthPercent are then used to position each event for clicking
    const leftMost = Math.min(...positions.map(p => p.left))
    const rightMost = Math.min(...positions.map(p => p.right))
    const leftPercent = (leftMost / positions[0].parentWidth) * 100
    const widthPercent = ((positions[0].parentWidth - leftMost - rightMost) / positions[0].parentWidth) * 100

    const eventToKeep = events.shift()

    events.forEach((event, i, allEvents) => {
        // making old events invisible (but still clickable)
        // moving them into new positions that line up with gradiented colours
        event.style.opacity = 0
        event.style.left = `calc(${leftPercent}% + ((${widthPercent}% - 0px) * ${(i + 1) / (allEvents.length + 1)} + 0px))`
        event.style.width = `calc((${widthPercent}% - 0px) * ${1 / (allEvents.length + 1)}`
        // if all day event, flex styling used so will have to override
        if (!event.style.height) {
            event.style.position = "absolute"
            event.style.top = 0
        }
    })

    if (eventToKeep.style.backgroundColor || eventToKeep.style.borderColor) {
        eventToKeep.originalStyle = eventToKeep.originalStyle || {
            backgroundImage: eventToKeep.style.backgroundImage,
            backgroundSize: eventToKeep.style.backgroundSize,
            left: eventToKeep.style.left,
            right: eventToKeep.style.right,
            width: eventToKeep.style.width,
            border: eventToKeep.style.border,
            borderColor: eventToKeep.style.borderColor,
            textShadow: eventToKeep.style.textShadow
        }
        eventToKeep.style.backgroundImage = fillOptions[fill_style](colors)
        eventToKeep.style.backgroundSize = "initial"
        eventToKeep.style.left =
            Math.min.apply(
                Math,
                positions.map(s => s.left)
            ) + "px"
        eventToKeep.style.right =
            Math.min.apply(
                Math,
                positions.map(s => s.right)
            ) + "px"
        eventToKeep.style.width = null
        // leave default colour unless eventToKeep 'would' be a coloured text event denoted by background colour not existing
        if (!colors[0].bg) eventToKeep.style.color = "#fff"

        // Clear setting color for declined events
        eventToKeep.querySelector('[aria-hidden="true"]').style.color = null

        const span = eventToKeep.querySelector("span")
        if (span) {
            const computedSpanStyle = window.getComputedStyle(span)
            if (computedSpanStyle?.color == "rgb(255, 255, 255)") {
                eventToKeep.style.textShadow = "0px 0px 2px black"
            } else {
                eventToKeep.style.textShadow = "0px 0px 2px white"
            }
        }

        events.forEach(event => {
            event.style.opacity = 0
        })
    } else {
        const dots = eventToKeep.querySelector('[role="button"] div:first-child')
        const dot = dots.querySelector("div")
        if (dot) {
            dot.style.backgroundImage = fillOptions[fill_style](colors)
            dot.style.width = colors.length * 4 + "px"
            dot.style.borderWidth = 0
            dot.style.height = "8px"
        }

        events.forEach(event => {
            event.style.opacity = 0
        })
    }
}

const resetMergedEvents = events => {
    events.forEach(event => {
        for (var k in event.originalStyle) {
            event.style[k] = event.originalStyle[k]
        }
    })
}

function findMatchingString(eventSets, string_1, wildcard) {
    const [prefix, suffix] = string_1.split(wildcard);
    const regexPattern = new RegExp(`${prefix}.*${suffix}`.replace(/[-[\]{}()*+?.,\\^$|]/g, "\\$&"));

    const stripped_wildcard = wildcard.replace(/^\/|\/$/g, "") // Remove leading and trailing slashes if there are any
    const user_regex_pattern = new RegExp(stripped_wildcard, "i") // Make it case insensitive

    // Escape special characters in the input string
    const escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const escaped_string_1 = escapeRegExp(string_1)

    // Split the wildcard by '|' to support multiple conditions (OR)
    const split_wildcards = stripped_wildcard.split("|")
    let regex_pattern = escaped_string_1

    // Replace each wildcard in the escaped string with the wildcard regex
    split_wildcards.forEach(pattern => {
        const temp_pattern = new RegExp(escapeRegExp(pattern), "i")
        regex_pattern = regex_pattern.replace(temp_pattern, ".*")
    })

    const array = Object.keys(eventSets)

    for (const str of array) {
        if (str.match(new RegExp(regex_pattern, "i"))) {
            return str
        }
    }

    return null
}

const merge = async mainCalender => {
    const getWildcard = () =>
        new Promise((res, rej) => {
            chrome.storage.local.get("wildcard", s => {
                if (chrome.runtime.lastError) {
                    rej(chrome.runtime.lastError)
                } else {
                    res(s.wildcard)
                }
            })
        })

    let wildcard
    try {
        wildcard = await getWildcard()
    } catch (error) {
        wildcard = ""
    }
    const eventSets = {}
    const days = mainCalender.querySelectorAll('[role="gridcell"]')
    days.forEach((day, index) => {
        const events = Array.from(day.querySelectorAll('[data-eventid][role="button"], [data-eventid] [role="button"]'))
        events.forEach(event => {
            const eventTitleEls = event.querySelectorAll('[aria-hidden="true"]')
            if (!eventTitleEls.length) {
                return
            }
            const eventKeyParts = [];
            eventKeyParts.push(index);
            eventKeyParts.push("_");
            eventTitleEls.forEach(el => {
                // Ignore location; sometimes it has name + address, sometimes not. This prevents merging of events that otherwise match.
                const [titleEl, timeEl, _locationEl] = el.children?.[0]?.children ?? [];
                eventKeyParts.push(titleEl?.textContent, timeEl?.textContent);
            });
            eventKeyParts.push(event.style.height);
            const eventKey = eventKeyParts.filter(x => !!x).join("").replace(/\s+/g, "");
            const wildcard_match_to_existing_key = wildcard ? findMatchingString(eventSets, eventKey, wildcard) : null
            // if the wildcard event is a match to an existing key, then add it to that key
            // rather than creating a new key
            if (wildcard_match_to_existing_key) {
                eventSets[wildcard_match_to_existing_key].push(event)
            } else {
                eventSets[eventKey] = eventSets[eventKey] || []
                eventSets[eventKey].push(event)
            }
        })
    })

    let daysWithMergedEvents = []

    Object.entries(eventSets).forEach(eventSet => {
        const index = eventSet[0].split("_")[0]
        const events = eventSet[1]
        // make sure this day appears in the daysWithMergedEvents array
        if (!daysWithMergedEvents.find(d => d.index === index)) {
            daysWithMergedEvents.push({ index: index, amount: 0 })
        }
        // get the current count for this day to use as top position of events
        const current_count_for_day = daysWithMergedEvents.find(d => d.index === index).amount

        if (events.length > 1) {
            mergeEventElements(events)
        } else {
            resetMergedEvents(events)
        }
        moveEvents(events, current_count_for_day)
        // add to the count
        daysWithMergedEvents.find(d => d.index === index).amount += 1
    })
}

let otherEventsMoved = []

const moveEvents = (events, from_top) => {
    if (!otherEventsMoved.includes(events[0])) {
        // if parent has roll = "presentation" then do not move as it is a day column
        // recent change to google cal means I now have to look to the parents parent and look for gridcell role.
        if (["gridcell", "presentation"].includes(events[0].parentElement.parentElement.getAttribute("role"))) {
            return
        }
        events[0].parentElement.style.top = `${from_top}em`
        otherEventsMoved.push(events[0])
    }
}

const init = mutationsList => {
    mutationsList &&
        mutationsList
            .map(mutation => mutation.addedNodes[0] || mutation.target)
            .filter(node => node.matches && node.matches('[role="main"], [role="dialog"], [role="grid"]'))
            .map(merge)
}

setTimeout(
    () =>
        chrome.storage.local.get("disabled", storage => {
            console.log(`Cal merge is ${storage.disabled ? "disabled" : "enabled"}`)
            if (!storage.disabled) {
                const observer = new MutationObserver(init)
                observer.observe(document.querySelector("body"), { childList: true, subtree: true, attributes: true })
            }

            chrome.storage.onChanged.addListener(changes => {
                if (changes.disabled) window.location.reload()
                if (changes.style) window.location.reload()
                if (changes.wildcard) window.location.reload()
            })
        }),
    10
)
