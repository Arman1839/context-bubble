try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
    from opentelemetry.sdk.resources import Resource
    HAS_OTEL = True
except ImportError:
    trace = None
    TracerProvider = None
    BatchSpanProcessor = None
    ConsoleSpanExporter = None
    Resource = None
    HAS_OTEL = False


def init_telemetry(service_name: str = "context-bubble-backend"):
    if not HAS_OTEL or not TracerProvider:
        return
    try:
        resource = Resource.create({"service.name": service_name})
        provider = TracerProvider(resource=resource)
        processor = BatchSpanProcessor(ConsoleSpanExporter())
        provider.add_span_processor(processor)
        trace.set_tracer_provider(provider)
    except Exception:
        pass


class _NoOpTracer:
    def start_as_current_span(self, name: str, **kwargs):
        from contextlib import nullcontext
        return nullcontext()


tracer = trace.get_tracer("context-bubble-tracer") if (HAS_OTEL and trace) else _NoOpTracer()
