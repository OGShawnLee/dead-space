import type { MenuDef, MenuItemDef } from './HoloMenu';
import type { CameraSettings } from '../types';

/**
 * Game menu definitions consumed by HoloMenu.
 * Kept separate from the engine so menu copy / structure can evolve independently.
 */
export interface MenuContext {
  startMission(): void;
  resume(): void;
  restart(): void;
  back(): void;
  getSettings(): CameraSettings;
  saveSettings(partial: Partial<CameraSettings>): void;
  getStats(): { kills: number; limbs: number };
}

export const DEFAULT_SETTINGS: CameraSettings = {
  invertY: false,
  invertX: false,
  sensitivity: 1.0,
  volume: 0.55
};

// ───────────────────────────── Shared submenus ─────────────────────────────

function controlsMenu(): MenuDef {
  const row = (id: string, label: string, keys: string[], description: string): MenuItemDef => ({
    id, label, kind: 'info', keys, description
  });
  return {
    id: 'controls',
    title: 'CONTROLES',
    items: [
      row('move', 'Moverse', ['W', 'A', 'S', 'D'], 'Desplaza a Isaac por los pasillos de la Ishimura. El RIG amortigua el ruido de las pisadas al caminar.'),
      row('look', 'Mirar / Rotar', ['RATÓN'], 'Rota el cuerpo de Isaac y la cámara sobre el hombro.'),
      row('aim', 'Apuntar', ['CLIC DER.'], 'Levanta el Cortador de Plasma y activa la mira láser de tres haces. Reduce la velocidad de movimiento.'),
      row('shoot', 'Disparar plasma', ['CLIC IZQ.'], 'Dispara un haz de plasma. Apunta a las extremidades: el torso absorbe casi todo el daño.'),
      row('stasis', 'Estasis', ['C', '/', 'E'], 'Mientras apuntas, lanza una carga de estasis que ralentiza a los necromorfos un 50% durante 5 segundos. También con clic central.'),
      row('reload', 'Recargar', ['R'], 'Inserta una nueva célula de plasma en el Cortador.'),
      row('sprint', 'Correr', ['SHIFT'], 'Acelera el paso. Hace más ruido y atrae a los necromorfos cercanos.'),
      row('heal', 'Botiquín', ['Q'], 'Inyecta un botiquín médico del RIG y restaura 50 puntos de salud.'),
      row('light', 'Linterna', ['F'], 'Enciende o apaga la linterna montada en el hombro. Apagarla te oculta... y te deja a ciegas.'),
      row('pause', 'Pausa', ['ESC'], 'Suspende el enlace neuronal y abre el menú de pausa.')
    ]
  };
}

function briefingMenu(): MenuDef {
  return {
    id: 'briefing',
    title: 'BRIEFING DE MISIÓN',
    items: [
      {
        id: 'lore',
        label: '',
        kind: 'text',
        html: 'La nave minera <b>USG Ishimura</b> está en silencio. Los conductos de ventilación rezuman sangre y criaturas biomecánicas mutadas han tomado los pasillos.'
      },
      {
        id: 'objective',
        label: 'Objetivo primario',
        kind: 'info',
        value: 'CÁPSULA DE ESCAPE',
        description: 'Explora los sectores oscuros de la nave y alcanza la cápsula de escape en el extremo opuesto de la cubierta.'
      },
      {
        id: 'rule',
        label: 'Regla vital',
        kind: 'info',
        value: 'DESMEMBRAR',
        danger: true,
        description: 'Cortar sus extremidades es la única forma de frenarlos. Disparar al torso apenas les causa daño. Si les cortas ambos brazos, quedan desarmados.'
      },
      {
        id: 'threats',
        label: 'Amenazas conocidas',
        kind: 'info',
        value: '3 VARIANTES',
        description: 'Slashers con cuchillas óseas, Exploders con un saco volátil (dispárale al saco a distancia) y Leapers que se arrastran a gran velocidad.'
      }
    ]
  };
}

function rigGuideMenu(): MenuDef {
  return {
    id: 'rig-guide',
    title: 'GUÍA DEL RIG',
    items: [
      {
        id: 'health',
        label: 'Salud',
        kind: 'info',
        value: 'COLUMNA',
        description: 'Sensor luminoso 3D en la columna del traje RIG. Azul = saludable, naranja = herido, rojo parpadeante = crítico.'
      },
      {
        id: 'stasis',
        label: 'Estasis',
        kind: 'info',
        value: 'OMÓPLATO',
        description: 'Medidor circular sobre la placa del hombro derecho. Cian: 3 cargas, ámbar: 2, rojo: 1, apagado: vacío.'
      },
      {
        id: 'ammo',
        label: 'Munición',
        kind: 'info',
        value: 'HOLOGRAMA',
        description: 'Proyectada directamente sobre el Cortador de Plasma. Cambia de azul a naranja y rojo según la carga restante.'
      }
    ]
  };
}

function cameraMenu(ctx: MenuContext): MenuDef {
  return {
    id: 'camera',
    title: 'CÁMARA Y CONTROL',
    items: [
      {
        id: 'invert-y',
        label: 'Invertir eje Y',
        kind: 'toggle',
        getBool: () => !!ctx.getSettings().invertY,
        setBool: v => ctx.saveSettings({ invertY: v }),
        description: 'Invierte el cabeceo vertical de la cámara (arriba / abajo).'
      },
      {
        id: 'invert-x',
        label: 'Invertir eje X',
        kind: 'toggle',
        getBool: () => !!ctx.getSettings().invertX,
        setBool: v => ctx.saveSettings({ invertX: v }),
        description: 'Invierte el giro horizontal de la cámara (izquierda / derecha).'
      },
      {
        id: 'sensitivity',
        label: 'Sensibilidad del ratón',
        kind: 'slider',
        min: 0.4,
        max: 2.6,
        step: 0.1,
        getNum: () => ctx.getSettings().sensitivity || 1.0,
        setNum: v => ctx.saveSettings({ sensitivity: v }),
        format: v => `${v.toFixed(1)}x`,
        description: () => `Velocidad de rotación de la cámara. Valor actual: ${(ctx.getSettings().sensitivity || 1).toFixed(1)}x.`
      },
      {
        id: 'reset',
        label: 'Restablecer valores',
        onSelect: () => ctx.saveSettings({
          invertY: DEFAULT_SETTINGS.invertY,
          invertX: DEFAULT_SETTINGS.invertX,
          sensitivity: DEFAULT_SETTINGS.sensitivity
        }),
        description: 'Restaura la configuración de cámara de fábrica del RIG.'
      }
    ]
  };
}

function audioMenu(ctx: MenuContext): MenuDef {
  return {
    id: 'audio',
    title: 'AUDIO',
    items: [
      {
        id: 'volume',
        label: 'Volumen general',
        kind: 'slider',
        min: 0,
        max: 100,
        step: 5,
        getNum: () => Math.round((ctx.getSettings().volume ?? DEFAULT_SETTINGS.volume!) * 100),
        setNum: v => ctx.saveSettings({ volume: v / 100 }),
        format: v => `${Math.round(v)}`,
        description: 'Volumen maestro de la síntesis procedural: disparos, necromorfos, respiración y el zumbido de la nave.'
      }
    ]
  };
}

function settingsMenu(ctx: MenuContext): MenuDef {
  return {
    id: 'settings',
    title: 'CONFIGURACIÓN',
    items: [
      {
        id: 'camera',
        label: 'Cámara y control',
        submenu: () => cameraMenu(ctx),
        description: 'Inversión de ejes y sensibilidad del ratón.'
      },
      {
        id: 'audio',
        label: 'Audio',
        submenu: () => audioMenu(ctx),
        description: 'Volumen general del sintetizador de audio.'
      },
      {
        id: 'rig',
        label: 'Guía del RIG',
        submenu: rigGuideMenu,
        description: 'Cómo leer la interfaz diegética del traje: salud, estasis y munición.'
      }
    ]
  };
}

// ───────────────────────────── Root menus ─────────────────────────────

export function buildMainMenu(ctx: MenuContext): MenuDef {
  return {
    id: 'main',
    title: 'MENÚ PRINCIPAL',
    items: [
      {
        id: 'new-game',
        label: 'Nueva partida',
        onSelect: () => ctx.startMission(),
        description: 'Desciende a la USG Ishimura. Explora los sectores oscuros y alcanza la cápsula de escape con vida.'
      },
      {
        id: 'briefing',
        label: 'Briefing de misión',
        submenu: briefingMenu,
        description: 'Informe de situación de la Ishimura y la regla vital para sobrevivir.'
      },
      {
        id: 'controls',
        label: 'Controles',
        submenu: controlsMenu,
        description: 'Asignación de teclas del RIG y del Cortador de Plasma.'
      },
      {
        id: 'settings',
        label: 'Configuración',
        submenu: () => settingsMenu(ctx),
        description: 'Cámara, audio y guía de la interfaz del traje.'
      }
    ]
  };
}

export function buildPauseMenu(ctx: MenuContext): MenuDef {
  return {
    id: 'pause',
    title: 'MENÚ DE PAUSA',
    items: [
      {
        id: 'resume',
        label: 'Reanudar',
        onSelect: () => ctx.resume(),
        description: 'Restablece el enlace neuronal y vuelve a la Ishimura.'
      },
      {
        id: 'settings',
        label: 'Configuración',
        submenu: () => settingsMenu(ctx),
        description: 'Cámara, audio y guía de la interfaz del traje.'
      },
      {
        id: 'controls',
        label: 'Controles',
        submenu: controlsMenu,
        description: 'Asignación de teclas del RIG y del Cortador de Plasma.'
      },
      {
        id: 'restart',
        label: 'Reiniciar sector',
        submenu: () => ({
          id: 'restart-confirm',
          title: 'REINICIAR SECTOR',
          variant: 'danger',
          items: [
            {
              id: 'confirm',
              label: 'Confirmar reinicio',
              danger: true,
              onSelect: () => ctx.restart(),
              description: 'Se perderá todo el progreso del sector actual. La Ishimura se regenerará desde cero.'
            },
            {
              id: 'cancel',
              label: 'Cancelar',
              onSelect: () => ctx.back(),
              description: 'Regresa al menú de pausa.'
            }
          ]
        }),
        description: 'Reinicia la incursión desde la sala de inicio.'
      }
    ]
  };
}

export function buildDeathMenu(ctx: MenuContext): MenuDef {
  const stats = ctx.getStats();
  return {
    id: 'death',
    title: 'SEÑAL VITAL PERDIDA',
    variant: 'danger',
    intro: {
      title: 'TRAJE RIG: OPERADOR FALLECIDO',
      body: 'Has sucumbido ante los Necromorfos. Tus restos han sido asimilados por la nave.'
    },
    items: [
      {
        id: 'retry',
        label: 'Reintentar',
        danger: true,
        onSelect: () => ctx.restart(),
        description: 'Has sucumbido ante los Necromorfos. Tus restos han sido asimilados por la nave. Reinicia el sector e inténtalo de nuevo.'
      },
      {
        id: 'kills',
        label: 'Necromorfos eliminados',
        kind: 'info',
        value: String(stats.kills),
        description: 'Criaturas neutralizadas antes de perder la señal vital.'
      },
      {
        id: 'limbs',
        label: 'Extremidades cortadas',
        kind: 'info',
        value: String(stats.limbs),
        description: 'Desmembramiento táctico registrado por el RIG.'
      }
    ]
  };
}

export function buildVictoryMenu(ctx: MenuContext): MenuDef {
  const stats = ctx.getStats();
  return {
    id: 'victory',
    title: 'EVACUACIÓN COMPLETADA',
    variant: 'success',
    items: [
      {
        id: 'again',
        label: 'Nueva incursión',
        onSelect: () => ctx.restart(),
        description: 'Has escapado con vida a bordo de la cápsula. Las transmisiones de auxilio han sido emitidas al espacio profundo.'
      },
      {
        id: 'kills',
        label: 'Necromorfos eliminados',
        kind: 'info',
        value: String(stats.kills),
        description: 'Criaturas neutralizadas durante la evacuación.'
      },
      {
        id: 'limbs',
        label: 'Extremidades cortadas',
        kind: 'info',
        value: String(stats.limbs),
        description: 'Desmembramiento táctico registrado por el RIG.'
      }
    ]
  };
}
