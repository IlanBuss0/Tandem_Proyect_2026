# Verificacion profesional

## Flujo

`DNI frontal -> OCR -> REFEPS publico -> matching -> estado persistido`

El registro profesional recibe `multipart/form-data`; la imagen debe enviarse en `dni_frente`. Se procesa unicamente en memoria y no se guarda. Tesseract.js extrae nombre, apellido y DNI, pero esto no prueba la autenticidad fisica del documento.

La identidad declarada se compara primero con el OCR. Despues se compara matricula, nombre, apellido y DNI contra REFEPS. Solo se asigna `VERIFIED` si existe un unico resultado coincidente y su `situacionMatricula` es `Habilitado`. OCR inseguro, ambiguedad o matricula inactiva pasan a `MANUAL_REVIEW`. Un timeout, error HTTP o cambio de estructura queda registrado como `VERIFICATION_ERROR`, pero el perfil permanece en `MANUAL_REVIEW`; nunca se rechaza como falso por una falla tecnica.

## Proveedor REFEPS

`RefepsPublicProvider` hace un GET al buscador para obtener cookie y `form_build_id`, y luego un POST al mismo URL con `searchBy=matricula`, `matricula`, `op=Consultar` y `form_id=argobar_consulta_refeps_profesionales`. El HTML devuelve datos JSON en `Drupal.settings.refepsProfesionales.allItems`.

La estructura real observada es:

- `allItems`: array de profesionales.
- Cada profesional incluye `nombre`, `apellido`, `nroDoc` y `profesiones`.
- Cada profesion incluye `profesionReferencia`, `refepsEspecialidad` y `matriculas`.
- Cada matricula incluye `matricula`, `provinciaMatricula` y `situacionMatricula`.

El proveedor encapsula ese detalle y normaliza nombre, apellido, DNI, profesion, jurisdiccion, matricula y habilitacion.

Si cambia el sitio, actualizar unicamente `RefepsPublicProvider.parseHtml` y sus fixtures. Una respuesta sin la estructura conocida debe producir `STRUCTURE_MISMATCH`, nunca `NOT_FOUND`.

El proveedor implementa el contrato `buscarPorMatricula`. Un futuro cliente del WS020 oficial puede reemplazarlo mediante inyeccion en `ValidacionProfesionalService` sin cambiar OCR, matching, persistencia ni registro. Del mismo modo, una futura capa biometrica puede agregarse como otro proveedor coordinado por el servicio, sin acoplarla a Auth ni al OCR.

## Base de datos y pruebas

Ejecutar `npm run db:professional-verification` para agregar estados y metadatos minimos. Ejecutar `npm run test:professional-verification` para OCR, matching, parser y coordinacion deterministas.

La suite automatica no depende de Internet. Para probar el buscador publico real:

```bash
REFEPS_TEST_MATRICULA=12345 npm run test:refeps-real
```

En Windows, si el entorno local falla con revocacion de certificado antes de llegar al sitio, se puede diagnosticar manualmente con:

```bash
REFEPS_ALLOW_INSECURE_TLS=1 REFEPS_TEST_MATRICULA=12345 npm run test:refeps-real
```

No usar `REFEPS_ALLOW_INSECURE_TLS=1` en produccion.

## Google

`POST /api/auth/google` sigue aceptando JSON para login y para crear cuentas no profesionales. Si se crea una cuenta nueva con rol `profesional`, debe enviarse `multipart/form-data` con `accessToken`, `rol`, `profesion`, `matricula` y `dni_frente`. El flujo reutiliza la misma verificacion automatica que el registro tradicional.

## Restricciones

Un profesional solo accede a permisos sensibles sobre pertenecientes cuando el vinculo esta activo/aprobado, el tutor aprobo el vinculo si corresponde, ambos usuarios estan activos y el estado profesional es `VERIFIED` (tambien se mantienen alias historicos como `validado`, `aprobado` o `verificado`). `PENDING`, `MANUAL_REVIEW`, `DATA_MISMATCH`, `NOT_FOUND` y `VERIFICATION_ERROR` no habilitan historial, ubicacion, chat profesional, sesiones ni asignaciones.
