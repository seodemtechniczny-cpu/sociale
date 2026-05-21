import logging
import sys


def setup_logging() -> logging.Logger:
    logger = logging.getLogger("sociale")
    logger.setLevel(logging.DEBUG)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
    )
    logger.addHandler(handler)
    return logger


logger = setup_logging()
