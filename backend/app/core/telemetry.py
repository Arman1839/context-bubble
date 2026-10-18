from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.sdk.resources import Resource


def init_telemetry(service_name: str = "context-bubble-backend"):
    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    # Console exporter for development / Cloud Run logging ingestion
    processor = BatchSpanProcessor(ConsoleSpanExporter())
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)


tracer = trace.get_tracer("context-bubble-tracer")
