const statusForbidActions : Record<string, string[]> = {
    "封印": ['attack', 'skill'],
    "沉默": ['skill'],
    "眩晕": ['attack', 'skill', 'item', 'escapse', 'dodge', 'fback'], 
}

let actionForbidByStatus : Record<string, string[]>;

function initActionForbidByStatus(){
    actionForbidByStatus = {};
    for (const [status, actions] of Object.entries(statusForbidActions)) {
        for (const action of actions) {
            if (!actionForbidByStatus[action]) {
                actionForbidByStatus[action] = [];
            }
            actionForbidByStatus[action].push(status);
        }
    }
}


export function findForbidStatusByAction(action: string): string[] {
    if (!actionForbidByStatus) {
        initActionForbidByStatus();
    }
    return actionForbidByStatus[action];
}