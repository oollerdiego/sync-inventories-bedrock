import { world, system } from "@minecraft/server";

const fotosInventario = new Map();
let trancado = false;

// Tira a foto e agora nos devolve uma lista (array) para facilitar a comparação
function tirarFotoDetalhada(jogador) {
    const container = jogador.getComponent("inventory").container;
    let slots = [];
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item) {
            slots.push({ id: i, data: `${item.typeId}:${item.amount}` });
        } else {
            slots.push({ id: i, data: "vazio" });
        }
    }
    return slots;
}

// Sincroniza apenas o slot que mudou
function sincronizarSlotEspecifico(fonte, grupo, slotIndex) {
    const invFonte = fonte.getComponent("inventory").container;
    const itemFonte = invFonte.getItem(slotIndex);

    for (const alvo of grupo) {
        if (alvo.id === fonte.id) continue;
        const invAlvo = alvo.getComponent("inventory").container;
        
        // Só mexe no buraquinho que mudou!
        invAlvo.setItem(slotIndex, itemFonte);
        
        // Atualiza a foto interna desse alvo para esse slot
        const fotoAlvo = fotosInventario.get(alvo.id);
        if (fotoAlvo) {
            fotoAlvo[slotIndex].data = (itemFonte) ? `${itemFonte.typeId}:${itemFonte.amount}` : "vazio";
        }
    }
}

system.runInterval(() => {
    if (trancado) return;

    const grupoSync = world.getAllPlayers().filter(p => p.hasTag("sync"));
    if (grupoSync.length === 0) return;

    for (const jogador of grupoSync) {
        const fotoAtual = tirarFotoDetalhada(jogador);
        const fotoAntiga = fotosInventario.get(jogador.id);

        if (fotoAntiga) {
            let mudouAlgo = false;

            // Compara buraquinho por buraquinho
            for (let i = 0; i < fotoAtual.length; i++) {
                if (fotoAtual[i].data !== fotoAntiga[i].data) {
                    mudouAlgo = true;
                    trancado = true;

                    // Só sincroniza esse slot específico
                    sincronizarSlotEspecifico(jogador, grupoSync, i);
                    
                    // Pequena pausa para o jogo processar
                    system.runTimeout(() => { trancado = false; }, 1);
                }
            }

            if (mudouAlgo) {
                fotosInventario.set(jogador.id, fotoAtual);
                break; 
            }
        } else {
            fotosInventario.set(jogador.id, fotoAtual);
        }
    }
}, 2); // Rodando mais rápido (a cada 0.1s) para diminuir conflitos