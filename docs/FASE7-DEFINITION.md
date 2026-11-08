# Plugin System Module

**Responsabilidad:** proporcionar un mecanismo estandarizado para extender el producto.

Un plugin podrá aportar uno o varios elementos:

- Nuevos nodos.
- Nuevos edges.
- Nuevos renderizadores.
- Nuevos tipos de propiedades.
- Nuevas herramientas.
- Nuevos paneles.
- Nuevos validadores.
- Nuevos temas.
- Nuevos importadores.
- Nuevos exportadores.
- Nuevas acciones de interfaz.

Cada plugin deberá declarar:

- Plugin ID.
- Name.
- Version.
- Description.
- Author.
- Dependencies.
- Compatibility.
- Contributions.
- Permissions, si aplica.

Debe existir un ciclo de vida:

1. Discover.
2. Resolve dependencies.
3. Validate manifest.
4. Register contributions.
5. Activate.
6. Deactivate.
7. Unregister.

**Seguridad:** los plugins ejecutables deben tratarse como código de terceros. No se debe permitir que un documento JSON/YAML active código arbitrario. La carga de plugins debe ser explícita y estar controlada por la aplicación host.

# Diseño del sistema de plugins

## Tipos de plugins

| Plugin             | Responsabilidad                            |
| ------------------ | ------------------------------------------ |
| Node Plugin        | Añadir tipos de nodos                      |
| Edge Plugin        | Añadir tipos de conexiones                 |
| Property Plugin    | Añadir controles de propiedades            |
| Panel Plugin       | Añadir paneles de gestión                  |
| Theme Plugin       | Añadir temas                               |
| Layout Plugin      | Añadir composiciones                       |
| Tool Plugin        | Registrar herramientas                     |
| Validator Plugin   | Añadir validaciones                        |
| Importer Plugin    | Añadir formatos de entrada                 |
| Exporter Plugin    | Añadir formatos de salida                  |
| Integration Plugin | Añadir integraciones con sistemas externos |

## Distribución

Se recomienda soportar:

- Paquetes npm públicos.
- Paquetes npm privados.
- Plugins internos de una aplicación.
- Plugins cargados explícitamente en tiempo de ejecución.

No recomiendo implementar inicialmente un marketplace ni un sistema de descarga dinámica de plugins.

Primero debe estabilizarse el contrato de extensión.

## Versionado

Cada plugin debe declarar:

- Su versión.
- La versión compatible del SDK.
- Las dependencias necesarias.
- Las versiones de las definiciones que aporta.

Se debe evitar que dos plugins registren accidentalmente el mismo identificador.

