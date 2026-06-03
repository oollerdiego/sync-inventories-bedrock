import { world, system } from "@minecraft/server";

const fotosInventario = new Map();
let trancado = false;

// Função para tirar a foto do inventário (Sua função original)
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

// Função para sincronizar um slot específico (Sua função original)
function sincronizarSlotEspecifico(fonte, grupo, slotIndex) {
    const invFonte = fonte.getComponent("inventory").container;
    const itemFonte = invFonte.getItem(slotIndex);

    for (const alvo of grupo) {
        if (alvo.id === fonte.id) continue;
        const invAlvo = alvo.getComponent("inventory").container;
        
        if (itemFonte) {
            invAlvo.setItem(slotIndex, itemFonte.clone());
        } else {
            invAlvo.setItem(slotIndex, null);
        }
        
        const fotoAlvo = fotosInventario.get(alvo.id);
        if (fotoAlvo) {
            fotoAlvo[slotIndex].data = itemFonte ? `${itemFonte.typeId}:${itemFonte.amount}` : "vazio";
        }
    }
}

// --- FUNÇÃO DE SEGURANÇA PARA QUEM GANHA A TAG ---
function verificarEForçarSincronizacao(jogadorNovo) {
    const todosJogadores = world.getAllPlayers();
    
    // Encontra os outros que já tinham a tag sync antes dele
    const outrosComSync = todosJogadores.filter(p => p.hasTag("sync") && p.id !== jogadorNovo.id);

    if (outrosComSync.length > 0) {
        // Pega o jogador mais antigo online
        const jogadorMaisAntigo = outrosComSync[0];
        
        const fotoNovo = tirarFotoDetalhada(jogadorNovo);
        const fotoAntigo = tirarFotoDetalhada(jogadorMaisAntigo);

        let temDiferenca = false;
        for (let i = 0; i < fotoNovo.length; i++) {
            if (fotoNovo[i].data !== fotoAntigo[i].data) {
                temDiferenca = true;
                break;
            }
        }

        // Se o inventário de quem ganhou a tag for diferente do mais antigo, o do mais antigo domina!
        if (temDiferenca) {
            trancado = true;
            const invAlvo = jogadorNovo.getComponent("inventory").container;
            const invFonte = jogadorMaisAntigo.getComponent("inventory").container;

            for (let i = 0; i < invFonte.size; i++) {
                const itemFonte = invFonte.getItem(i);
                invAlvo.setItem(i, itemFonte ? itemFonte.clone() : null);
            }

            jogadorNovo.sendMessage("§a[Sync Inventories]§r A tag §async§r foi adicionada em você, seu inventário era diferente do grupo. Ele foi substituído pelo de §b" + jogadorMaisAntigo.name + "§r para evitar erros.\n");
            
            // Cria fotos novas idênticas para os dois imediatamente
            const fotoAtualizada = tirarFotoDetalhada(jogadorNovo);
            fotosInventario.set(jogadorNovo.id, fotoAtualizada);
            
            system.runTimeout(() => { trancado = false; }, 5);
        }
    } else {
        // Se ele for o primeirão, só tira a foto dele
        fotosInventario.set(jogadorNovo.id, tirarFotoDetalhada(jogadorNovo));
    }
}

// Detecta quando o jogador entra no mundo
world.afterEvents.playerSpawn.subscribe((event) => {
    const jogador = event.player;
    if (!event.initialSpawn) return;

    system.runTimeout(() => {
        if (!jogador || !world.getAllPlayers().some(p => p.id === jogador.id)) return;

        jogador.sendMessage(
            "§a[Sync Inventories]§r O addon de sincronização de inventário está ativo neste mundo!\n" +
            "§eNota:§r Para sincronizar seu inventário com outros jogadores, você precisa da tag §b'sync'§r.\n" +
            "§7Use o comando ou peça para algum operador usar:§e /tag @s add sync"
        );

        if (jogador.hasTag("sync")) {
            verificarEForçarSincronizacao(jogador);
        }
    }, 100); 
});

// LOOP PRINCIPAL (Ajustado para não mexer em quem acabou de ganhar a tag)
system.runInterval(() => {
    const todosJogadores = world.getAllPlayers();
    const grupoSync = todosJogadores.filter(p => p.hasTag("sync"));

    // Limpeza de memória: Se o cara perdeu a tag ou saiu, deleta a foto dele na hora!
    for (const idSalvo of fotosInventario.keys()) {
        const aindaTaNoGrupo = grupoSync.some(p => p.id === idSalvo);
        if (!aindaTaNoGrupo) {
            fotosInventario.delete(idSalvo);
        }
    }

    if (trancado || grupoSync.length === 0) return;

    for (const jogador of grupoSync) {
        // SE O JOGADOR NÃO TEM FOTO NA MEMÓRIA: Significa que ele acabou de ganhar a tag!
        if (!fotosInventario.has(jogador.id)) {
            verificarEForçarSincronizacao(jogador);
            continue; // Pula ele neste tick para dar tempo de atualizar
        }

        const fotoAtual = tirarFotoDetalhada(jogador);
        const fotoAntiga = fotosInventario.get(jogador.id);

        if (fotoAntiga) {
            let mudouAlgo = false;

            for (let i = 0; i < fotoAtual.length; i++) {
                if (fotoAtual[i].data !== fotoAntiga[i].data) {
                    mudouAlgo = true;
                    trancado = true;

                    sincronizarSlotEspecifico(jogador, grupoSync, i);
                    
                    system.runTimeout(() => { trancado = false; }, 1);
                }
            }

            if (mudouAlgo) {
                fotosInventario.set(jogador.id, fotoAtual);
                break; 
            }
        }
    }
}, 2);