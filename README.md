# Defensa del Quincho

Juego de defensa por oleadas en realidad mixta para Meta Quest 3 (WebXR `immersive-ar` + passthrough), hecho con Three.js y Vite.

**Estado: Etapa 6 (completo)** — calibración guiada, 4 armas (2 copias de cada una, una por mano), granadas desde los cajones o la mano libre, ametralladora en la silla, 5 tipos de enemigo + élites, jefe que cae en un meteorito con su horda, panel de mejoras, partidas que se pueden continuar, estilo toon con contornos y listo para GitHub Pages.

## Partidas

- **Cada partida nueva arranca de cero**: $0, sin mejoras ni desbloqueos, base al 100%.
- La partida se guarda sola al **superar cada oleada** (y al comprar en el panel). En la pantalla de inicio aparece **"Continuar partida guardada (nivel N, $X)"**: tildalo antes de entrar para seguir desde ahí. Si no lo tildás, empezás de cero.
- Al perder (game over) la partida guardada se borra. El **récord** (nivel máximo) se guarda siempre.
- **Borrar partida guardada y récord** en la pantalla de inicio deja todo limpio.

## Dificultad

- Oleada n: **8 + 4n** enemigos, vida **×(1 + 0,22n)**, velocidad **×(1 + 0,06n)** (tope ×2).
- Salen a veces **en grupos de 2 o 3**. Máximo 26 vivos a la vez.
- **Élites** desde el nivel 4: dorados, un poco más grandes, con aura, **×1,9 de vida** y el doble de monedas.
- Monedas más justas: Corredor $3, Bruto $9, Volador $5, Saltador $6, Jefe $80, más un bonus por oleada.

## Jefe (cada 5 niveles)

Es el **último de la oleada**: cuando quedan pocos enemigos aparece "¡SE VIENE EL JEFE!", cae un **meteorito** desde el cielo con estela de fuego y humo, y una **marca roja** en el piso muestra dónde va a pegar. Al impactar: explosión enorme, cráter, onda expansiva, y sale el Jefe con una **horda de 6 + n enemigos** alrededor. El hielo lo frena pero casi no lo congela.

## Las dos manos

- **Dos armas**: el armero tiene 2 pistolas, 2 escopetas y 2 fusiles (el láser es uno solo).
- **Granadas con la mano libre**: si una mano no tiene arma, **grip en cualquier lado** saca una granada del tipo seleccionado. Cerca de un cajón, saca de ese cajón.
- **A / X con la mano libre** cambia el tipo de granada (en la muñeca: `[Gr 3] · Ra 2 · Hi 2`).

## Armas

| Arma | Cómo se consigue | Cómo es |
| --- | --- | --- |
| Pistola | inicial | Semiautomática, precisa. Cabeza ×2,5 |
| Escopeta | inicial | 8 perdigones, mucho retroceso, corto alcance, con cartuchos al costado |
| Fusil | $220 | Automático, cargador de 30, mira telescópica |
| Rayo láser | $600, necesita el Fusil y 10 mejoras | Haz continuo que atraviesa a todos, energía que se recarga sola |

Cada arma tiene un **contador de balas** brillante (se pone rojo cuando queda poco). **A / X** recarga; devolverla al armero también.

**Mejoras especiales** (en violeta): **tiro múltiple** (2 → 3 → 5 en abanico), **perforación** (+1, +2, +3 enemigos) y **disparo explosivo**.

## Granadas

| Tipo | Cómo se consigue | Qué hace |
| --- | --- | --- |
| Granada (verde) | inicial, 3 por oleada | Explosión de 3,5 m |
| Racimo (naranja) | $220, 2 por oleada | Explota y suelta 6 bombitas |
| Hielo (celeste) | $180, 2 por oleada | Congela 1,5 s y ralentiza 4 s en 4,5 m |

Soltá el grip con un movimiento de lanzamiento: sale con la velocidad real del control (×1,5). Mecha de 2 s; si toca a un enemigo explota en el momento. Se reponen al empezar cada oleada.

## Ametralladora (silla)

Se desbloquea al llegar al **nivel 8 en la partida**. Sentate (cabeza por debajo de 1,2 m y cerca de la silla), apuntá con el control derecho y gatillo: el cañón tarda ~0,6 s en girar y tira 16 balas/s. Si se recalienta se traba 3 s. Mejoras: daño, enfriamiento y balas explosivas.

## Enemigos

| Tipo | Desde nivel | Cómo es |
| --- | --- | --- |
| Corredor (rosa) | 1 | Rápido, visor amarillo, cuchillas en las muñecas |
| Bruto (naranja) | 3 | Armadura pesada, tanque en la espalda, 30 de daño a la base |
| Volador (celeste) | 4 | Dron-murciélago con alas de membrana, zigzag a distintas alturas |
| Saltador (verde) | 6 | Cabeza de rana, ojos saltones, avanza a los saltos |
| Jefe (violeta) | 5, 10, 15… | Corona, cuernos, runas que brillan, 80 de daño a la base |

**Tiro a la cabeza:** daño ×2,5 (pistola), "ding", cartel "¡CABEZA!", vibración fuerte y +50% de monedas si lo matás así.

## Rendimiento (Quest 3, objetivo 72 fps)

- Cada enemigo y cada arma se dibujan con pocas piezas: todas las partes de un mismo material se unen en una sola geometría con colores por pieza.
- Los contornos de dibujo animado y las barras de vida solo se dibujan de cerca.
- Partículas y trazadoras con `InstancedMesh` (una llamada de dibujo cada uno), objetos reciclados (sin crear basura durante el juego), tope de enemigos vivos, foveación activada.
- Agregá **`?debug=1`** a la URL para ver los **FPS** en la muñeca (verde ≥ 70, amarillo ≥ 55, rojo menos). Si en tu quincho baja, contame en qué momento (jefe, muchas explosiones…).

## Atajos para probar

- `?nivel=8` arranca una partida nueva directo en ese nivel (por ejemplo `?nivel=5` para ver al Jefe, `?nivel=8` para la ametralladora).
- `?debug=1` muestra los FPS. Se pueden combinar: `?nivel=5&debug=1`.
- `window.game` queda disponible en la consola (`chrome://inspect`).

## Requisitos

- Node.js 18 o más nuevo (LTS). En Windows: `winget install OpenJS.NodeJS.LTS` (cerrá y abrí la terminal después).
- El Quest 3 y la PC en la misma red Wi-Fi, o un cable USB-C.

```powershell
npm install
```

## Opción A — Por Wi-Fi (HTTPS)

```powershell
npm run dev
```

Vite muestra algo como `Network: https://192.168.1.50:5173/`.

1. En el Quest abrí **Meta Quest Browser** y escribí la dirección **completa, con `https://` adelante**.
2. Aparece "La conexión no es privada" (el certificado es autofirmado): **Avanzado → Continuar**.
3. Tocá **Entrar en realidad mixta** y aceptá los permisos.

Si no carga, Windows Firewall puede estar bloqueando a Node: permitilo en *redes privadas*.

## Opción B — Por cable USB (`adb reverse`)

Con `localhost` no hace falta certificado: WebXR lo considera seguro.

1. Activá el **modo desarrollador** del Quest (app Meta Horizon en el celular → Dispositivos → Modo desarrollador).
2. Instalá las *Android Platform Tools* (trae `adb`): `winget install Google.PlatformTools`.
3. Conectá el cable, poné el visor y aceptá **Permitir depuración USB**.

```powershell
adb devices
```

```powershell
adb reverse tcp:5173 tcp:5173
```

```powershell
npm run dev:http
```

4. En el Quest Browser abrí `http://localhost:5173`.

`adb reverse` se pierde al desconectar el cable: hay que volver a correrlo.

## Ver la consola del Quest desde la PC

1. Con el Quest conectado por USB (depuración aceptada), abrí **Chrome** en la PC y andá a `chrome://inspect/#devices`.
2. Aparece el Quest con las pestañas del Quest Browser. Tocá **inspect** en la del juego.

Además, cualquier error de JavaScript aparece dentro del visor como un cartel rojo **ERROR**.

## Modo escritorio (sin visor)

| Acción | Tecla |
| --- | --- |
| Apuntar / disparar | mouse / click |
| Recargar | R |
| Cambiar arma | 1–4 |
| Granada / tipo de granada | G / T |
| Montar la ametralladora | M |
| Mirar alrededor | click derecho + arrastrar |
| Caminar (probar la línea límite) | WASD |
| Salir | Esc |

## Cómo se juega en el visor

**Calibración** (la primera vez; queda guardada):

1. Parate en el borde de la mesa, apoyá la punta del control en el borde y apuntalo hacia el parque → **gatillo**.
2. Tocá la pared con la punta del control → **gatillo**. Ahí aparece el armero.
3. Tocá el piso al costado de la mesa → **gatillo**. Ahí van los cajones.
4. Tocá la silla → **gatillo**. Ahí va la ametralladora.

**B / Y** vuelve un paso atrás. En sesiones siguientes solo hay que **re-anclar** con un gatillo en el borde de la mesa. Mantené **B / Y 2 s** para calibrar todo de nuevo.

**Armas:** grip cerca del armero para agarrar; para devolverla, acercala, volvé a apretar grip y soltalo. **Línea límite:** si tu cabeza pasa el borde de la mesa, la vista se pone roja y no podés disparar ni tirar granadas.

## Ajustes rápidos

Todo el balance está en [`src/config.js`](src/config.js): `waves` (cantidad, vida, velocidad, grupos, élites), `boss` (cuándo cae, horda), `enemies`, `weapons`, `grenades.throwMult` (fuerza del lanzamiento), `turret.seatHeadHeight` (altura para montar la ametralladora), `hand.weaponOffset` y `hand.wristOffset`.

## Estructura

```
src/
  main.js         arranque, pantalla de inicio, sesión WebXR
  game.js         estados, partidas y loop principal
  calibration.js  calibración guiada + re-anclaje
  player.js       controles XR, botones, haptics, escudo de la línea límite
  weapons.js      armero, modelos de armas, contador de balas, disparo, láser
  grenades.js     cajones, granadas, física de lanzamiento, racimo y hielo
  turret.js       ametralladora de la silla
  enemies.js      modelos detallados, animación, élites, nivel de detalle
  waves.js        oleadas, grupos, élites, jefe con meteorito y horda
  upgrades.js     mejoras y panel de la tienda
  hud.js          muñeca, mensajes, viñeta roja, FPS
  effects.js      partículas, trazadoras, portales, explosiones, meteorito
  materials.js    estilo toon, contornos y unión de piezas
  audio.js        sonidos sintetizados con WebAudio
  desktop.js      modo escritorio
  storage.js      calibración, partida guardada y récord
  config.js       números de balance
```

## Publicar en GitHub Pages

Ya está todo listo: `vite.config.js` usa `base: './'` y está el workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

1. Creá un repositorio en GitHub y subí esta carpeta a la rama `main`.
2. En el repo: **Settings → Pages → Source: GitHub Actions**.
3. Cada vez que subas cambios se publica solo en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`. GitHub Pages ya es HTTPS, así que en el Quest entrás directo, sin aviso de certificado y sin la PC prendida.
