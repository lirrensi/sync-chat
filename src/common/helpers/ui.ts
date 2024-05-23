import { DateTime } from "luxon";
import bytes from "bytes";

export function displayDate(timestamp: number) {
    const currentDate = DateTime.local().startOf("day");
    const date = DateTime.fromMillis(timestamp);
    let dateString = "";
    if (date.hasSame(currentDate, "day")) {
        // If the date is the same day, return time only
        dateString = date.toFormat("HH:mm");
    } else {
        // If the date is different, return date and time
        dateString = date.toFormat("dd LLL yyyy HH:mm");
    }
    return dateString;
}

export async function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function truncateWithEllipsis(str: string, maxLength: number) {
    if (str.length <= maxLength) {
        return str;
    }

    const startLength = Math.ceil(maxLength / 2) - 1; // Length of start of string
    const endLength = Math.floor(maxLength / 2); // Length of end of string

    const start = str.slice(0, startLength); // Start of string
    const end = str.slice(-endLength); // End of string

    return start + "..." + end;
}

export function sortEntitiesByStatus(entities: any[]) {
    return entities.reduce(
        (entityList: any, entity: any) => {
            if (entity.state === 1) {
                entityList.active.list.push(entity);
            }
            if (entity.state === 2) {
                entityList.pinned.list.push(entity);
            }
            if (entity.state === 3) {
                entityList.archived.list.push(entity);
            }
            if (entity.state === 4) {
                entityList.removed.list.push(entity);
            }
            return entityList; // Return the accumulated value in each iteration
        },
        {
            pinned: { label: "Pinned", list: [] },
            active: { label: "Active", list: [] },
            archived: { label: "Archived", list: [] },
            removed: { label: "Removed", list: [] },
        } // Initial value with correct structure
    );
}
