# Asfalto Regio

Juego de carreras 3D en línea para navegador de PC. Juega con tus amigos en salas públicas o privadas
(con código de 5 letras), o practica solo contra la computadora.

- **14 modos**: Circuito, Fórmula, Callejero (con tráfico), Drift, Contrarreloj (con fantasma), Arrancones,
  Touge, Rally, Eliminación, Resistencia (gasolina, llantas y pits), Persecución (policías contra fugitivos),
  Óvalo (rebufo), Gymkhana y Libre.
- **Pistas temáticas**, incluido el **Autódromo Monterrey** con su trazado real (datos de OpenStreetMap).
- **Autos reales** de varios países, con mejoras y personalización completa.
- **Cámaras**: cabina con volante y tablero, cofre, y dos en tercera persona; retrovisor.
- **Sin choques entre autos**: se atraviesan y se ven transparentes, pero si alcanzas a alguien por detrás
  pierdes puntos y velocidad.
- Progreso guardado en el navegador; se puede llevar a otra PC con un código.
- Música original generada, motores sintetizados y narrador.

## Controles

| Acción | Teclado | Control |
|---|---|---|
| Acelerar / frenar | W / S (o flechas) | RT / LT |
| Dirección | A / D (o flechas) | Stick izquierdo |
| Freno de mano | Espacio | A |
| Nitro | Shift o N | X |
| Cambios (manual) | E / Q | RB / LB |
| Cámara | C | Y |
| Mirar atrás | B | B |
| Regresar a la pista | R | Back |
| Retrovisor | M | — |
| Pausa | Esc | Start |

## Desarrollo

Sin build: módulos ES y Three.js r170 por import map.

```
node tools/serve.mjs 5180
```

Luego abre http://localhost:5180. `?debug` expone `window.ar`; `?sala=CODIGO` entra directo a una sala.
Páginas de prueba por módulo en `tests/`. El contrato entre módulos está en `DISENO.md`.

Red: señalización y control por Supabase Realtime; los autos viajan por WebRTC P2P (respaldo por Supabase).
Récords en la tabla `ar_records`.

Trazado del Autódromo Monterrey © colaboradores de OpenStreetMap (ODbL).
