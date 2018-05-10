import { LocalizationDictionary } from '../i18n/localization';
import { GameState, VariableChangedEvent } from '../gameState';
import { Inventory, Item } from '../effect/item';
import { EffectProviderCollectionChangedEvent } from '../effect/effect';
import { renderText } from './textRenderer';
import { StatusTable, Status } from '../effect/status';
import { GuiModalBox } from './guiModalBox';
import { GuiBase } from './guiBase';
import { GameEngine } from '../gameEngine';

export interface GuiGame {

    displayMessage(message: string, confirm: string, icon?: string): Promise<void>;

    displayChoices(message: string, choices: Array<[string, number]>, icon?: string): Promise<number>;

}

export class GuiGameWindow extends GuiBase<HTMLDivElement> implements GuiGame {

    private _messageContainer: HTMLParagraphElement;
    private _choicesContainer: HTMLElement;
    private _itemsContainer: HTMLElement;
    private _statusContainer: HTMLElement;
    private _hopeMeter: HTMLElement;
    private _timeMeter: HTMLElement;

    private _modalBox: GuiModalBox;

    constructor(container: HTMLDivElement, private _ldict: LocalizationDictionary, private _gameEngine: GameEngine) {
        super(container);
        this._modalBox = new GuiModalBox(this.retrieveElement('modal_container'));
        this._messageContainer = this.retrieveElement('message_container');
        this._hopeMeter = this.retrieveElement('hope_meter');
        this._timeMeter = this.retrieveElement('time_meter');
        this._choicesContainer = this.retrieveElement('choices_container');
        this._itemsContainer = this.retrieveElement('item_list');
        this._statusContainer = this.retrieveElement('status_list');
        this._gameEngine.gameState.onVariableChanged = (gs, e) => {
            this.handleVariableUpdate(gs, e);
        };
        this._gameEngine.gameState.playerInventory.onChanged = (inv, e) => {
            this.updateItemList(<Inventory>inv, e);
        };
        this._gameEngine.gameState.playerStatus.onChanged = (sTable, e) => {
            this.updateStatusList(<StatusTable>sTable, e);
        }
        this._itemsContainer.onclick = e => {
            let target = e.target;
            if (target instanceof HTMLLIElement) {
                const itemId = target.getAttribute('data-item-id');
                if (!itemId) return;
                const item = this._gameEngine.itemRegistry.get(itemId);
                this._modalBox.display(
                    this._ldict.translate(item.unlocalizedName),
                    renderText(item.unlocalizedDescription, _ldict, _gameEngine.gameState),
                    this._ldict.translate('message.ok'),
                    item.icon
                );
            } 
        };
        this._statusContainer.onclick = e => {
            let target = e.target;
            if (target instanceof HTMLLIElement) {
                const statusId = target.getAttribute('data-status-id');
                if (!statusId) return;
                const status = this._gameEngine.statusRegistry.get(statusId);
                this._modalBox.display(
                    this._ldict.translate(status.unlocalizedName),
                    renderText(status.unlocalizedDescription, _ldict, _gameEngine.gameState),
                    this._ldict.translate('message.ok'),
                    status.icon
                );
            }
        };
    }

    retrieveElement<T extends HTMLElement>(id: string): T {
        let el = document.getElementById(id);
        if (!el) throw new Error(`Unable to find #${id}.`);
        return <T>el;
    }

    handleVariableUpdate(gs: GameState, e: VariableChangedEvent): void {
        if (e.clear) return;
        switch (e.varName) {
            case 'player.hope':
                if (e.newValue < 40 && e.newValue > 20) {
                    this._hopeMeter.className = 'warning';
                } else if (e.newValue <= 20) {
                    this._hopeMeter.className = 'critical';
                } else {
                    this._hopeMeter.className = 'normal';
                }
                this._hopeMeter.textContent = `Hope ${e.newValue}/${gs.getVarLimits(e.varName)[1]}`;
                break;
            case 'year':
            case 'month':
                this._timeMeter.textContent = `Year ${gs.getVar('year', true)} Month ${gs.getVar('month', true)}`;
                break;
        }
    }

    updateItemList(inv: Inventory, e: EffectProviderCollectionChangedEvent<Item>): void {
        while (this._itemsContainer.lastChild) {
            this._itemsContainer.removeChild(this._itemsContainer.lastChild);
        }
        if (e.clear) return;
        for (const itemId in inv.items) {
            let node = document.createElement('li');
            let item = inv.items[itemId];
            node.setAttribute('data-item-id', item[0].id);
            if (item[0].rarity >= 10) {
                node.className = 'r_legendary';
            } else if (item[0].rarity >= 6) {
                node.className = 'r_rare';
            } else if (item[0].rarity >= 3) {
                node.className = 'r_uncommon';
            }
            node.textContent = this._ldict.translate(item[0].unlocalizedName) + ' x' + item[1].toString();
            node.title = this._ldict.translate(item[0].unlocalizedDescription);
            this._itemsContainer.appendChild(node);
        }
    }

    updateStatusList(statusTable: StatusTable, e: EffectProviderCollectionChangedEvent<Status>): void {
        while (this._statusContainer.lastChild) {
            this._statusContainer.removeChild(this._statusContainer.lastChild);
        }
        if (e.clear) return;
        for (const itemId in statusTable.items) {
            let node = document.createElement('li');
            let status = statusTable.items[itemId];
            node.textContent = this._ldict.translate(status[0].unlocalizedName);
            node.title = this._ldict.translate(status[0].unlocalizedDescription);
            node.setAttribute('data-status-id', itemId);
            this._statusContainer.appendChild(node);
        }
    }

    displayMessage(message: string, confirm: string, icon?: string): Promise<void> {
        return new Promise<void>(resolve => {
            this.updateMessage(message, icon);
            const btnConfirm = document.createElement('a');
            btnConfirm.className = 'btn';
            btnConfirm.href = 'javascript: void(0)';
            btnConfirm.textContent = this._ldict.translate(confirm);
            this._choicesContainer.appendChild(btnConfirm);
            btnConfirm.onclick = () => {
                this._messageContainer.textContent = '';
                btnConfirm.onclick = null;
                btnConfirm.remove();
                resolve();        
            }
        });
    }

    displayChoices(message: string, choices: Array<[string, number]>, icon?: string): Promise<number> {
        return new Promise<number>(resolve => {
            this.updateMessage(message, icon);
            let choiceButtons : HTMLAnchorElement[] = [];
            for (let i = 0;i < choices.length;i++) {
                let btn = document.createElement('a');
                let [choiceMessage, choiceId] = choices[i];
                btn.className = 'btn';
                btn.textContent = this._ldict.translate(choiceMessage);
                btn.href = 'javascript: void(0);';
                btn.setAttribute('data-choice-number', choiceId.toString());
                btn.onclick = () => {
                    this._messageContainer.textContent = '';
                    for (btn of choiceButtons) btn.remove();
                    resolve(choiceId);
                };
                choiceButtons.push(btn);
                this._choicesContainer.appendChild(btn);
            }
        });
    }

    updateMessage(message: string, icon?: string): void {
        let html = renderText(message, this._ldict, this._gameEngine.gameState);
        if (icon) {
            html += `<p><img src="${icon}" /></p>`;
        }
        this._messageContainer.innerHTML = html;
    }

}
