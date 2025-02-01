// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { extension_settings, getContext } from "../../../extensions.js";

//You'll likely need to import some other functions from the main script
import { chat, saveSettingsDebounced } from "../../../../script.js";

// Keep track of where your extension is located, name should match repo name
const extensionName = "sillytavern-inventory";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

function refreshInventory() {
  document.getElementById("inventory_viewer").value = JSON.stringify(getContext().chatMetadata.inventory || {}, null, 2)

}

function setInventory() {
  getContext().chatMetadata.inventory = JSON.parse(document.getElementById("inventory_viewer").value)
  saveSettingsDebounced();
}

function addItemToInventory(args) {
  const context = getContext()
  const inventory = context.chatMetadata.inventory;
  const owner = args.owner === "char" ? context.name2 : context.name1
  let actionDescription = '';

  if (!inventory[args.owner]) {
    inventory[args.owner] = {
      items: {},
      equipped: {}
    }
  }

  if (inventory[args.owner].items[args.id]) {
    inventory[args.owner].items[args.id].count += args.count
  } else {
    inventory[args.owner].items[args.id] = {
      name: args.name,
      count: args.count
    }
  }
  actionDescription = `Added ${args.count} ${args.name} to ${owner}'s inventory. They now have ${inventory[args.owner].items[args.id].count} total.`

  getContext().chatMetadata = inventory
  return actionDescription
}

function removeItemFromInventory(args) {
  const context = getContext()
  const inventory = context.chatMetadata.inventory;
  const owner = args.owner === "char" ? context.name2 : context.name1
  let actionDescription = '';

  if (!inventory[args.owner]) {
    inventory[args.owner] = {
      items: {},
      equipped: {}
    }
  }

  if (inventory[args.owner].items[args.id]) {
    inventory[args.owner].items[args.id].count -= args.count
    if (inventory[args.owner].items[args.id].count <= 0) {
      delete inventory[args.owner].items[args.id]
      actionDescription = `Removed all ${args.name} from ${owner}'s inventory.`
    } else {
      actionDescription = `Removed ${args.count} ${args.item} from ${owner}'s inventory`
    }
  } else {
    actionDescription = `${owner} does not have any ${args.name} in their inventory. Nothing was changed.`
  }

  getContext().chatMetadata = inventory
  return actionDescription
}

function equipItem(args) {
  const context = getContext()
  const inventory = context.chatMetadata.inventory;
  const owner = args.owner === "char" ? context.name2 : context.name1
  const wearer = args.wearer === "char" ? context.name2 : context.name1
  let actionDescription = '';

  if (!inventory[args.owner]) {
    inventory[args.owner] = {
      items: {},
      equipped: {}
    }
  }

  if (inventory[args.owner].items[args.id] || args.create) {
    if (args.create && !inventory[args.owner].items[args.id]) {
      inventory[args.owner].items[args.id] = {
        name: args.id,
        count: 1
      }
    }
    // Transfer one item from owner to wearer
    if (args.owner !== args.wearer) {
      // Remove one item from owner
      inventory[args.owner].items[args.id].count -= 1;
      if (inventory[args.owner].items[args.id].count <= 0) {
        delete inventory[args.owner].items[args.id];
      }

      // Add one item to wearer
      if (!inventory[args.wearer].items[args.id]) {
        inventory[args.wearer].items[args.id] = {
          name: inventory[args.owner].items[args.id].name,
          count: 1
        }
      } else {
        inventory[args.wearer].items[args.id].count += 1;
      }
    }

    // Equip the item for the wearer
    inventory[args.wearer].equipped[args.id] = inventory[args.wearer].items[args.id];
    actionDescription = `${wearer} equipped ${inventory[args.wearer].items[args.id].name} from ${owner}'s inventory. It is now in ${wearer}'s inventory and equipped.`;
  } else {
    actionDescription = `${owner} does not have ${args.id} in their inventory and create was not enabled. Nothing was changed.`
  }

  getContext().chatMetadata = inventory
  return actionDescription
}

function unequipItem(args) {
  const context = getContext()
  const inventory = context.chatMetadata.inventory;
  const owner = args.owner === "char" ? context.name2 : context.name1
  let actionDescription = '';

  if (!inventory[args.owner]) {
    inventory[args.owner] = {
      items: {},
      equipped: {}
    }
  }

  if (inventory[args.owner].equipped[args.id]) {
    delete inventory[args.owner].equipped[args.id];
    actionDescription = `${owner} unequipped ${args.id}`;
  } else {
    actionDescription = `${owner} does not have ${args.id} equipped. Nothing was changed.`;
  }

  getContext().chatMetadata = inventory
  return actionDescription
}


jQuery(async () => {
  const context = getContext();
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);

  document.getElementById("inventory_refresh").addEventListener("click", refreshInventory)
  document.getElementById("inventory_set").addEventListener("click", setInventory)

  context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
    getContext().chatMetadata.inventory = {
      char: {
        items: {},
        equipped: {},
      },
      user: {
        items: {},
        equipped: {},
      }
    };
  });

  context.registerMacro("inventory", () => {
    return JSON.stringify(getContext().chatMetadata.inventory || {}, null, 2);
  });

  context.registerFunctionTool({
    name: "addItemToInventory",
    displayName: "Add Item to Inventory",
    description: "Adds an item to the characters",
    parameters: {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          enum: ["char", "user"],
          description: 'Who should the item should be given to',
        },
        id: {
          type: 'string',
          description: 'camelCase id of the item',
        },
        name: {
          type: 'string',
          description: 'The proper full name of the item in singular form',
        },
        count: {
          type: 'number',
          description: 'The number of the item that should be given to owner',
        },
      },
      required: [
        'owner', 'id', 'name', 'count',
      ],
    },
    action: addItemToInventory,
    formatMessage: (args) => {
      const context = getContext()
      return `Added ${args.name} to ${args.owner === "char" ? context.name2 : context.name1}'s inventory`
    },
    shouldRegister: () => true,
    stealth: false,
  });

  context.registerFunctionTool({
    name: "removeItemToInventory",
    displayName: "Remove Item to Inventory",
    description: "Removes an item to the characters",
    parameters: {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          enum: ["char", "user"],
          description: 'Who should the item should be taken from',
        },
        id: {
          type: 'string',
          description: 'camelCase id of the item',
        },
        count: {
          type: 'number',
          description: 'The number of the item that should be taken from the owner',
        },
      },
      required: [
        'owner', 'id', 'count',
      ],
    },
    action: (args) => removeItemFromInventory,
    formatMessage: (args) => {
      const context = getContext()
      return `Removed ${args.name} from ${args.owner === "char" ? context.name2 : context.name1}'s inventory`
    },
    shouldRegister: () => true,
    stealth: false,
  });

  context.registerFunctionTool({
    name: "equipItem",
    displayName: "Equip Item",
    description: "Equips an item on a person",
    parameters: {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          enum: ["char", "user"],
          description: 'Who has the item to be equipped in their inventory',
        },
        wearer: {
          type: 'string',
          enum: ["char", "user"],
          description: 'Who should equip the item',
        },
        id: {
          type: 'string',
          description: 'camelCase id of the item',
        },
        create: {
          type: "boolean",
          description: "Whether the item should be created if it does not exist in the owners inventory"
        }
      },
      required: [
        'owner', 'id',
      ],
    },
    action: (args) => equipItem,
    formatMessage: (args) => {
      const context = getContext()
      return `Equipped ${args.name} for ${args.owner === "char" ? context.name2 : context.name1}`
    },
    shouldRegister: () => true,
    stealth: false,
  });

  context.registerFunctionTool({
    name: "unequipItem",
    displayName: "Uneuip Item",
    description: "Unequips an item on a person",
    parameters: {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          enum: ["char", "user"],
          description: 'Who should unequip the item',
        },
        id: {
          type: 'string',
          description: 'camelCase id of the item',
        },
      },
      required: [
        'owner', 'id',
      ],
    },
    action: (args) => unequipItem,
    formatMessage: (args) => {
      const context = getContext()
      return `Unequipped ${args.name} for ${args.owner === "char" ? context.name2 : context.name1}`
    },
    shouldRegister: () => true,
    stealth: false,
  });

  context.registerFunctionTool({
    name: "setInventory",
    displayName: "Set Inventory Directly",
    description: "Directly sets the entire inventory structure. Use this when multiple items are missing or need updating",
    parameters: {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {
        inventory: {
          type: 'object',
          description: 'The complete inventory object to set',
          properties: {
            char: {
              type: 'object',
              properties: {
                items: {
                  type: 'object',
                  description: 'Items owned by the character',
                  patternProperties: {
                    "^.*$": {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        count: { type: 'number' }
                      }
                    }
                  }
                },
                equipped: {
                  type: 'object',
                  description: 'Items currently equipped by the character',
                  patternProperties: {
                    "^.*$": {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        count: { type: 'number' }
                      }
                    }
                  }
                }
              },
              required: ['items', 'equipped']
            },
            user: {
              type: 'object',
              properties: {
                items: {
                  type: 'object',
                  description: 'Items owned by the user',
                  patternProperties: {
                    "^.*$": {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        count: { type: 'number' }
                      }
                    }
                  }
                },
                equipped: {
                  type: 'object',
                  description: 'Items currently equipped by the user',
                  patternProperties: {
                    "^.*$": {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        count: { type: 'number' }
                      }
                    }
                  }
                }
              },
              required: ['items', 'equipped']
            }
          },
          required: ['char', 'user']
        }
      },
      required: ['inventory'],
    },
    action: (args) => {
      getContext().chatMetadata.inventory = args.inventory;
      return "Inventory has been completely replaced with the new structure";
    },
    formatMessage: () => "Updated entire inventory structure",
    shouldRegister: () => true,
    stealth: false,
  });

});

/*
inventory: {
  "char": {
    "inventory": {}
    "equipped": {}
  }
  "user": {
  }
}
*/
