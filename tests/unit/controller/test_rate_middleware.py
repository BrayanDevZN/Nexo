from fastapi import FastAPI
from starlette.requests import Request

from backend.controller.middleware.rate_limits import route_template


def request(app, path, method="GET"):
    return Request({"type": "http", "app": app, "path": path, "root_path": "", "method": method,
                    "headers": [], "query_string": b"anything=untrusted"})


def test_route_template_uses_parameter_pattern_even_for_wrong_method():
    app = FastAPI()
    app.get("/clients/{identifier}")(lambda identifier: {})
    assert route_template(request(app, "/clients/one")) == "/clients/{identifier}"
    assert route_template(request(app, "/clients/two", "PUT")) == "/clients/{identifier}"
    assert route_template(request(app, "/random-one")) == "unmatched"
    assert route_template(request(app, "/random-two")) == "unmatched"
