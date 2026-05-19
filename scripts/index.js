import { world, system } from "@minecraft/server";

const fotosInventario = new Map();
let trancado = false;

// Função para tirar a foto do inventário 
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

// Jogador Nasce / Entra no mundo
world.afterEvents.playerSpawn.subscribe((event) => {
    const jogador = event.player;
    
    // Se ele já spawnou antes no mundo (morreu e renasceu), não faz nada
    if (!event.initialSpawn) return;

    // Espera 5 segundos (100 ticks) para o jogo carregar o jogador totalmente ou o jogo d apessoa for levemente mais lento
    system.runTimeout(() => {
        // Verifica se o jogador ainda está online e é válido
        if (!jogador || !world.getAllPlayers().some(p => p.id === jogador.id)) return;

        // Avisa que o addon está ativo
        jogador.sendMessage(
            "§a[Sync Inventories]§r O addon está ativo neste mundo!\n" +
            "§eNota:§r Para sincronizar seu inventário com outros jogadores, você precisa da tag §b'sync'§r.\n" +
            "§7Use o comando: /tag @s add sync"
        );

        // --- LÓGICA DE ENTRADA ---
        // Se o jogador que entrou tem a tag 'sync'
        if (jogador.hasTag("sync")) {
            
            // Encontra todos os outros jogadores que têm a tag 'sync' e que NÃO são o jogador que acabou de entrar
            const outrosJogadoresComSync = world.getAllPlayers().filter(p => p.hasTag("sync") && p.id !== jogador.id);

            // Se existir mais alguém no mundo com a tag sync
            if (outrosJogadoresComSync.length > 0) {
                // O primeiro jogador da lista costuma ser o mais antigo (ou o dono do mundo/host) segundo observação rápida nas docs
                const jogadorMaisAntigo = outrosJogadoresComSync[0];

                const invAlvo = jogador.getComponent("inventory").container;
                const invFonte = jogadorMaisAntigo.getComponent("inventory").container;

                trancado = true; // Tranca o loop principal para não dar conflito

                // Copia o inventário do mais antigo para o jogador que entrou
                for (let i = 0; i < invFonte.size; i++) {
                    const itemFonte = invFonte.getItem(i);
                    if (itemFonte) {
                        invAlvo.setItem(i, itemFonte.clone());
                    } else {
                        invAlvo.setItem(i, null);
                    }
                }

                // Cria a foto do inventário atualizada para o jogador que acabou de entrar
                const fotoNova = tirarFotoDetalhada(jogador);
                fotosInventario.set(jogador.id, fotoNova);

                jogador.sendMessage("§a[Sync Inventories]§r Seu inventário foi sincronizado com o de §b" + jogadorMaisAntigo.name + "§r.");
                
                // Destranca o sistema no próximo tick do jogo
                system.runTimeout(() => { trancado = false; }, 1);

            } else {
                // Se ele for o único com a tag no mundo, apenas tira a foto do inventário dele
                fotosInventario.set(jogador.id, tirarFotoDetalhada(jogador));
            }
        }
    }, 100); 
});

// Função para sincronizar um slot específico
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

// Loop principal de checagem (feitos pequenos ajustes de "segurança')
system.runInterval(() => {
    if (trancado) return;

    const grupoSync = world.getAllPlayers().filter(p => p.hasTag("sync"));
    if (grupoSync.length === 0) return;

    for (const jogador of grupoSync) {
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
        } else {
            // Se por algum motivo o jogador está no grupo mas não tem foto (ex: tirou a tag e colocou de novo)
            fotosInventario.set(jogador.id, fotoAtual);
        }
    }
}, 2);