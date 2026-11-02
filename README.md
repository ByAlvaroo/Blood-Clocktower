# Clocktower · Narrador Digital

Web para jugar a Blood on the Clocktower con los móviles, sin Narrador humano y sin servidor propio. Se publica gratis en GitHub Pages.

**HECHO POR @BYALVARO__**

## Publicarla en GitHub

1. Crea un repositorio público en GitHub, por ejemplo `clocktower`.
2. Pulsa **uploading an existing file** y arrastra **el contenido** de esta carpeta (no la carpeta entera). Debe quedar `index.html` en la raíz.
3. Ve a **Settings → Pages**. En **Source** elige **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`. Guarda.
4. En un par de minutos tendrás la web en `https://TU-USUARIO.github.io/clocktower/`.

GitHub Pages usa HTTPS, que es obligatorio para la cámara y para que los móviles se conecten.

## Cómo se juega

1. Cada persona abre la web, se hace una foto y escribe su nombre.
2. El anfitrión pulsa **Crear una sala nueva** y comparte el código de 4 letras o el enlace.
3. En la sala, el anfitrión ordena la lista igual que estáis sentados. El orden importa para roles como el Empático.
4. Con 5 a 15 jugadores, pulsa **Empezar la partida**. Lo demás es automático.

Cada noche todos copian un texto entero en su móvil. **Solo amanece cuando todos lo han completado**, y en pantalla se ve quién lo tiene completo y quién sigue escribiendo. Quien tenga una acción debe elegirla antes. Si alguien se desconecta más de 25 segundos deja de bloquear la noche, y tras 3 minutos el anfitrión puede forzar el amanecer.

Cada día puede caer un **Edicto del caos**: votos secretos, un voto más o menos para ejecutar, una persona que no puede nominar, rumores, cartas anónimas, Luna de sangre (doble texto) y más. El nivel de caos se elige en la sala.

## Consejos para que vaya bien

- **Abre la sala en un portátil o tablet enchufado** y marca “Este dispositivo solo es pantalla de mesa”. La partida vive en el navegador del anfitrión: si ese dispositivo se apaga, todo se detiene.
- Si el anfitrión recarga la página, puede pulsar **Volver** y la partida sigue. Los jugadores se reconectan solos y conservan su rol.
- Si es un móvil el que hace de anfitrión, no lo bloquees ni cambies de app durante la partida.
- El anfitrión es de confianza: alguien con conocimientos podría leer los roles en las herramientas de desarrollador de su navegador. Por eso conviene que sea una pantalla de mesa.

## Narrador

El narrador automático reparte los roles, resuelve la noche, da información falsa a borrachos y envenenados, decide cómo se registran Ermitaño y Espía y procura mantener la partida igualada.

Gemini orienta esas decisiones y escribe los amaneceres. La clave está en `js/config.js`, así que **cualquiera puede verla** en un repositorio público; limita su uso en la consola de Google. Si Gemini falla, la partida sigue igual. El modelo también se cambia en ese archivo.

## Roles

De los 130 roles de la guía, 111 están automatizados. Los otros 19 aparecen en la guía de la web con el motivo por el que no entran en el reparto; casi todos dependen de oír lo que se dice en la mesa o de que un Narrador humano improvise. La lista está en `EXCLUDED`, dentro de `js/engine.js`.

Se sigue el texto de tu guía, aunque a veces difiera del juego oficial. Donde la guía deja una decisión abierta, decide el narrador automático (por ejemplo, Barbero y Sombrerero).

## Conexión

Los móviles se conectan directamente por WebRTC. Para encontrarse usan el servidor público gratuito de PeerJS. Las conexiones difíciles, como datos móviles de operadores distintos, pasan por su servidor TURN público. Si algún día falla, puedes montar tu propio [PeerServer](https://github.com/peers/peerjs-server) y cambiar `SIGNAL` en `js/config.js`.

Los iPhone no admiten la vibración web: el cambio de fase se ve en la pantalla, pero no vibra.

## Pruebas

```bash
node tests/fuzz.mjs 20000   # miles de partidas simuladas con todos los roles
node tests/rules.mjs        # reglas concretas
node tests/e2e.mjs          # partida real con varios navegadores (requiere Playwright)
```

Proyecto de aficionado sin relación oficial con The Pandemonium Institute, creadores de Blood on the Clocktower.
