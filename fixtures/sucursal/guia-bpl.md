# Guía operativa del Banco Público del Litoral (BPL)

AVISO: contenido sintético para el hackathon ISD 2026; no describe a ninguna institución real.
Banco, productos, personas, identificadores y reglas operativas son ficticios.
Esta guía sirve para documentar una demostración; no ejecuta transacciones.
Versión de demostración: 2026-09-09.
Los montos se expresan en balboas (B/.).
Ninguna aprobación de esta guía mueve dinero real.

## AHO-AP-01 — Apertura de cuenta de ahorro

| Concepto | Regla ficticia |
| --- | --- |
| Producto | El código de producto de ahorro es AHO-BPL-01. |
| Depósito | El depósito inicial mínimo es B/. 25.00. |
| Cliente | Persona natural adulta con expediente completo. |

1. Verificar los documentos según DOC-NAT-01 o DOC-EXT-01.
2. Registrar la solicitud de apertura con código AHO-AP-01.
3. Confirmar que el enlace al CORE está disponible antes de activar la cuenta.
4. Registrar el depósito inicial mínimo de B/. 25.00.
5. Entregar constancia de solicitud al cliente ficticio.
Sin enlace al CORE no se activa una cuenta nueva.
La solicitud pendiente no constituye una cuenta abierta.
No se establecen tasas de interés ni rendimientos en esta guía.

## RET-ISL-01 — Modo isla: retiro sin enlace al CORE

| Control | Regla ficticia |
| --- | --- |
| Formulario | Usar el formulario RET-ISL-01 para documentar el retiro en contingencia. |
| Tope | El tope es B/. 100.00 por cliente y por día. |
| Firmas | Se requiere doble firma: cajero y supervisor de turno. |
| Folio | Asignar un folio único ISLA-AAAAMMDD-SUC-SECUENCIA. |

1. Confirmar con el supervisor la caída del enlace al CORE y abrir el expediente local.
2. Verificar identidad con documento ficticio y constancia local vigente del saldo.
3. Consultar el acumulado local del cliente en el día antes de documentar el retiro.
4. Completar el formulario RET-ISL-01 con folio, hora, monto y motivo.
5. Obtener la doble firma del cajero y del supervisor de turno.
6. Guardar el formulario y la evidencia en el expediente local.
El tope es B/. 100.00 por cliente y por día, sumando todos los retiros documentados.
No se permite fraccionar retiros para superar el tope diario.
Sin constancia local vigente del saldo, abstenerse y escalar con EX-SAL-01.
Si no se puede comprobar el acumulado diario entre sucursales, no autorizar el retiro.
El asistente solo documenta: no autoriza ni ejecuta el retiro.
No se permiten transferencias internacionales ni apertura de cuentas en modo isla.

## ISL-REC-01 — Recuperación del enlace y conciliación

1. El supervisor confirma la recuperación estable del enlace al CORE.
2. Ordenar los formularios de contingencia por folio y hora.
3. Comparar cada formulario contra los registros disponibles en el CORE.
4. Marcar las coincidencias y separar las diferencias para revisión humana.
5. Documentar el resultado de la conciliación en el expediente.
No reenviar operaciones automáticamente al recuperar el enlace.
No duplicar una operación que ya aparece registrada.
Una diferencia pendiente se escala con EX-CON-01.
Cerrar el expediente solo cuando la revisión documental esté lista.
El cierre del expediente no certifica que el CORE haya aplicado una operación.

## CAJ-ARQ-01 — Arqueo de caja

| Elemento | Acción |
| --- | --- |
| Efectivo | Contar por denominación con un segundo colaborador. |
| Comparación | Comparar el efectivo contado con el saldo del registro local. |
| Diferencia | Toda diferencia se documenta con INC-CAJA. |

1. Suspender temporalmente la atención en la caja que se está contando.
2. Contar billetes y monedas por denominación.
3. Comparar el total contado con el saldo del registro local.
4. Registrar fecha, hora y responsables del arqueo.
5. Obtener firma del cajero y del supervisor.
No compensar diferencias con dinero personal.
No borrar registros para hacer coincidir el saldo.

## INC-CAJA — Incidente por diferencia de caja

1. Abrir un incidente INC-CAJA por cualquier faltante o sobrante.
2. Registrar el monto de la diferencia y el folio del arqueo.
3. Notificar al supervisor de turno y conservar los comprobantes.
4. Realizar un segundo conteo con presencia del supervisor.
5. Adjuntar el resultado al expediente sin sobrescribir el primer conteo.
No se admite tolerancia automática para diferencias de caja.
El supervisor define el seguimiento humano del incidente.
El asistente no atribuye responsabilidad a una persona.

## DOC-NAT-01 — Documentos de persona natural adulta panameña

| Documento | Requisito |
| --- | --- |
| Identidad | Cédula ficticia vigente. |
| Domicilio | Constancia ficticia de domicilio. |
| Ingresos | Declaración ficticia de origen de fondos. |

1. Revisar vigencia y legibilidad de los documentos ficticios.
2. Registrar únicamente la verificación documental necesaria.
3. Si falta un documento obligatorio, aplicar EX-DOC-01.
No sustituir la cédula por una foto de redes sociales.
Ejemplo sintético de identificador: FICTICIO-CED-A001.

## DOC-EXT-01 — Documentos de persona natural extranjera adulta

| Documento | Requisito |
| --- | --- |
| Identidad | Pasaporte ficticio vigente. |
| Residencia | Carné ficticio de residencia vigente. |
| Domicilio | Constancia ficticia de domicilio. |
| Ingresos | Declaración ficticia de origen de fondos. |

1. Verificar que estén presentes los cuatro documentos requeridos.
2. Registrar la revisión documental con DOC-EXT-01.
3. Si falta un documento obligatorio, aplicar EX-DOC-01.
Ejemplo sintético de identificador: FICTICIO-PAS-B002.

## DOC-JUR-01 — Documentos de persona jurídica

1. Solicitar certificación ficticia de existencia de la sociedad.
2. Solicitar identificación ficticia del representante legal.
3. Solicitar declaración ficticia de beneficiarios finales y origen de fondos.
4. Remitir el expediente a revisión del supervisor antes de continuar.
La apertura para persona jurídica requiere revisión manual del supervisor.
La guía no define productos de crédito para sociedades.
No crear beneficiarios finales a partir de suposiciones.

## DAT-PRI-01 — Tratamiento local de datos personales

La Ley 81 de 2019 de Panamá se cita como marco de protección de datos personales.
Los datos biométricos son datos sensibles según ese marco.
Esta guía no reproduce artículos ni sustituye asesoría jurídica.
1. Usar exclusivamente datos sintéticos y ficticios en la demostración.
2. Mantener consultas, formularios y expedientes en el equipo local.
3. No enviar datos personales a servicios externos ni a modelos en la nube.
4. Limitar el acceso al personal autorizado para la demostración.
5. Evitar capturar huellas, rostros o plantillas biométricas.
No incluir identificadores personales en el registro de rendimiento.
El acta compartida debe contener únicamente datos sintéticos.
La firma permite detectar cambios en el contenido del acta.
La firma no cifra los datos del expediente.

## EX-DOC-01 — Excepción por documento faltante

1. Dejar la solicitud pendiente por documentación incompleta.
2. Indicar al cliente ficticio cuál documento obligatorio falta.
3. Registrar el motivo con EX-DOC-01 y remitir al supervisor.
No activar la cuenta mientras falte documentación obligatoria.
No aceptar documentos inventados por el asistente.

## EX-SAL-01 — Excepción por saldo sin respaldo local

1. Abstenerse de autorizar retiros sin constancia local vigente del saldo.
2. Registrar EX-SAL-01 en el expediente de contingencia.
3. Remitir al supervisor y esperar verificación del saldo.
Una afirmación verbal del cliente no sustituye la constancia local.
No estimar saldo ni permitir sobregiros con esta guía.

## EX-CON-01 — Excepción por diferencia al conciliar

1. Separar el folio con diferencia para revisión del supervisor.
2. Registrar EX-CON-01 y adjuntar ambos registros disponibles.
3. Mantener la diferencia pendiente hasta recibir revisión humana.
No alterar el formulario original ni aplicar ajustes automáticos.
No borrar un expediente para ocultar una diferencia.

## ALC-GUI-01 — Alcance y abstención

Esta guía cubre solo los procedimientos descritos expresamente en sus secciones.
No define préstamos hipotecarios, inversiones en criptomonedas ni seguros de vida.
No fija tasas de interés, tipos de cambio ni horarios de atención.
No contiene procedimientos de desbloqueo de banca móvil ni recuperación de PIN.
Si la consulta no está cubierta, responder: sin respaldo en la guía.
Una frase que excluye un tema no constituye un procedimiento para ese tema.
