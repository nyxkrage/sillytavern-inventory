// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { extension_settings, getContext } from "../../../extensions.js";

//You'll likely need to import some other functions from the main script
import { chat, saveSettingsDebounced } from "../../../../script.js";
import { arraysEqual } from "../../../utils.js";

// Keep track of where your extension is located, name should match repo name
const extensionName = "sillytavern-inventory";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

function refresh() {
  document.getElementById("inventory_viewer").value = JSON.stringify(getContext().chatMetadata.inventory || {}, null, 2)
  document.getElementById("stats_viewer").value = JSON.stringify(getContext().chatMetadata.stats || {}, null, 2)

}

function update() {
  getContext().chatMetadata.inventory = JSON.parse(document.getElementById("inventory_viewer").value)
  getContext().chatMetadata.stats = JSON.parse(document.getElementById("stats_viewer").value)

  saveSettingsDebounced();
}

jQuery(async () => {
  const context = getContext();
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);

  document.getElementById("inventory_refresh").addEventListener("click", refresh)
  document.getElementById("inventory_set").addEventListener("click", update)

  context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
    getContext().chatMetadata.inventory = {};
    getContext().chatMetadata.stats = {};
  });

  context.registerMacro("inventory", () => {
    return JSON.stringify(getContext().chatMetadata.inventory || {}, null, 2);
  });


  context.registerMacro("stats", () => {
    return JSON.stringify(getContext().chatMetadata.stats || {}, null, 2);
  });

  function validateCommands(args) {
    const validCommands = ['addItem', 'removeItem', 'updateItem', 'equipItem', 'unequipItem', 'setStat', 'updateStat'];
    const errors = [];

    if (!Array.isArray(args.commands)) {
      errors.push('Commands must be provided as an array');
    } else {
      for (const command of args.commands) {
        if (!command.cmd || !validCommands.includes(command.cmd)) {
          errors.push(`Invalid command: ${command.cmd}`);
          continue;
        }
        if (!command.character) {
          errors.push('Character must be specified for all commands');
          continue;
        }
        if (['addItem', 'removeItem', 'updateItem', 'equipItem', 'unequipItem'].includes(command.cmd)) {
          if (!command.item?.id) {
            errors.push(`Item ID required for ${command.cmd}`);
            continue;
          }
        }
        if (['setStat', 'updateStat'].includes(command.cmd)) {
          if (!command.stat?.name) {
            errors.push('Stat name required for stat commands');
          }
        }
      }
    }

    return errors;
  }

  function handleCommands(args) {
    const context = getContext();

    const errors = validateCommands(args);
    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }

    for (const command of args.commands) {
      const characterInventory = context.chatMetadata.inventory[command.character] || { inventory: {}, equipped: [] };
      const characterStats = context.chatMetadata.stats[command.character] || {};

      switch (command.cmd) {
        case 'addItem':
          if (!characterInventory.inventory[command.item.id]) {
            characterInventory.inventory[command.item.id] = command.item;
          } else {
            characterInventory.inventory[command.item.id].count += command.item.count;
          }
          break;

        case 'removeItem':
          if (characterInventory.inventory[command.item.id]) {
            characterInventory.inventory[command.item.id].count -= command.item.count;
            if (characterInventory.inventory[command.item.id].count <= 0) {
              delete characterInventory.inventory[command.item.id];
            }
          }
          break;

        case 'updateItem':
          if (characterInventory.inventory[command.item.id]) {
            characterInventory.inventory[command.item.id] = {
              ...characterInventory.inventory[command.item.id],
              ...command.item
            };
          }
          break;

        case 'equipItem':
          if (!characterInventory.equipped.includes(command.item.id)) {
            characterInventory.equipped.push(command.item.id);
          }
          break;

        case 'unequipItem':
          characterInventory.equipped = characterInventory.equipped.filter(id => id !== command.item.id);
          break;

        case 'setStat':
          characterStats[command.stat.name] = {
            description: command.stat.description,
            value: command.stat.value
          };
          break;
        case 'updateStat': {
          if (command.stat.value !== undefined) {
            characterStats[command.stat.name].value = command.stat.value;
          } else if (command.stat.change !== undefined && typeof characterStats[command.stat.name].value === 'number') {
            characterStats[command.stat.name].value += command.stat.change;
          }
          if (command.stat.description) {
            characterStats[command.stat.name].description = command.stat.description;
          }
          break;
        }
      }

      context.chatMetadata.inventory[command.character] = characterInventory;
      context.chatMetadata.stats[command.character] = characterStats;
    }

    saveSettingsDebounced();
    return "Commands executed successfully";
  }

  // Register function tool for inventory commands
  context.registerFunctionTool({
    name: "inventoryCommand",
    displayName: "Modify Inventory",
    description: "Modify inventory or stats with commands",
    parameters: {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              cmd: {
                type: 'string',
                enum: ['addItem', 'removeItem', 'updateItem', 'equipItem', 'unequipItem', 'setStat', 'updateStat'],
                description: 'Command to execute',
              },
              characters: {
                type: 'string',
                description: 'Who owns the item/stat',
              },
              item: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Item ID for commands that reference existing items',
                  },
                  name: {
                    type: 'string',
                    description: 'Display name of the item',
                  },
                  description: {
                    type: 'string',
                    description: 'Description of the item',
                  },
                  count: {
                    type: 'number',
                    description: 'Quantity of the item to be added/removed. Only applicable for addItem, removeItem or updateItem',
                    minimum: 0,
                  },
                },
                description: 'Item data, this is only applicable for the addItem, removeItem, updateItem, equipItem and uneuqipItem commands. For equipItem and unequipItem, only the id is required and the item must already exist in the inventory or must be added as well.',
              },
              stat: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Name of stat to modify',
                  },
                  description: {
                    type: 'string',
                    description: 'Description of the status effect'
                  },
                  value: {
                    type: ['number', 'string'],
                    description: 'Direct value to set stat to, this is mutally exclusive with change',
                  },
                  change: {
                    type: 'number',
                    description: 'Amount to increment/decrement stat by, if the stat/status is a string, this does nothing, this is mutally exclusive with value',
                  }
                },
                description: 'The stat to set/update, this is only applicable for the setStat and updateStat commands'
              }
            },
            required: ['cmd', 'character'],
          }
        },
      },
    },
    action: handleCommands,
    formatMessage: (args) => {
      return `Executed inventory commands: ${args.commands}`;
    },
    shouldRegister: () => true,
    stealth: false,
  });
});

/*
inventory: {
  "name": {
    "inventory": {}
    "equipped": []
  }
}
*/
